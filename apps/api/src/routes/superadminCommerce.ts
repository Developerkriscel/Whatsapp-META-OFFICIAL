/**
 * Commerce configuration: what is sold, what is charged on top, and who
 * processes the payment.
 *
 * All three were previously constants — credit packs hardcoded in the frontend,
 * a 2% platform fee and 18% GST baked into a formula beside them, and no
 * payment provider configuration at all. Changing a price meant a deploy, and
 * because the pack price lived nowhere near the rate card that bills those
 * credits, the two drifted 11x apart without anything noticing.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { encryptSecret, decryptIfPresent } from '../services/credentialEncryption.js';

export async function registerSuperadminCommerceRoutes(app: FastifyInstance) {
  // ── credit packages ────────────────────────────────────────────

  app.get('/credit-packages', async (request) => {
    const { country } = z.object({ country: z.string().length(2).default('IN') })
      .parse(request.query ?? {});

    const packages = await app.prisma.creditPackage.findMany({ orderBy: { sortOrder: 'asc' } });
    const { quotePackage } = await import('../services/pricing.js');

    const quoted = await Promise.all(packages.map(async (p) => ({
      ...p,
      quote: await quotePackage(app.prisma, p, country),
    })));

    // A pack whose value ratio is far from 1 is charging a buyer materially
    // more per credit than the engine consumes them at. Surfaced rather than
    // left for someone to notice.
    const mispriced = quoted
      .filter((q) => q.quote.valueRatio != null && (q.quote.valueRatio > 1.5 || q.quote.valueRatio < 0.5))
      .map((q) => ({ name: q.name, valueRatio: q.quote.valueRatio }));

    return { success: true, data: { packages: quoted, mispriced } };
  });

  const packageBody = z.object({
    name: z.string().min(1).max(60),
    credits: z.number().int().positive(),
    priceMinor: z.number().int().min(0),
    currency: z.string().length(3).default('INR'),
    description: z.string().max(300).optional(),
    isPopular: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post('/credit-packages', async (request, reply) => {
    const body = packageBody.parse(request.body);
    const created = await app.prisma.creditPackage.create({ data: body });
    return reply.status(201).send({ success: true, data: created });
  });

  app.patch('/credit-packages/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = packageBody.partial().parse(request.body);
    const exists = await app.prisma.creditPackage.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    return { success: true, data: await app.prisma.creditPackage.update({ where: { id }, data: body }) };
  });

  app.delete('/credit-packages/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    // Deactivated rather than deleted: a pack someone has already bought should
    // still resolve when a past transaction is opened.
    const exists = await app.prisma.creditPackage.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    await app.prisma.creditPackage.update({ where: { id }, data: { isActive: false } });
    return { success: true, data: { deactivated: id } };
  });

  // ── fees ────────────────────────────────────────────────────────

  app.get('/fees', async (request) => {
    const fees = await app.prisma.platformFee.findMany({ orderBy: { sortOrder: 'asc' } });

    // A worked example makes a stack of percentages legible in a way the raw
    // rows do not.
    const { priceWithFees } = await import('../services/pricing.js');
    const example = await priceWithFees(app.prisma, 10000, 'CREDIT_PURCHASE'); // ₹100.00

    return { success: true, data: { fees, exampleOn100: example } };
  });

  const feeBody = z.object({
    name: z.string().min(1).max(60),
    code: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only'),
    type: z.enum(['PERCENT', 'FIXED']),
    /** Basis points for PERCENT (250 = 2.5%), minor units for FIXED. */
    value: z.number().int().min(0),
    currency: z.string().length(3).default('INR'),
    appliesTo: z.enum(['CREDIT_PURCHASE', 'SUBSCRIPTION', 'ALL']).default('CREDIT_PURCHASE'),
    basis: z.enum(['BASE', 'SUBTOTAL', 'PRECEDING_FEES']).optional(),
    isVisible: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    description: z.string().max(300).optional(),
  });

  app.post('/fees', async (request, reply) => {
    const body = feeBody.parse(request.body);
    const clash = await app.prisma.platformFee.findUnique({ where: { code: body.code }, select: { id: true } });
    if (clash) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CODE_TAKEN', message: `A fee with code "${body.code}" already exists.` },
      });
    }
    return reply.status(201).send({ success: true, data: await app.prisma.platformFee.create({ data: body }) });
  });

  app.patch('/fees/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = feeBody.partial().parse(request.body);
    const exists = await app.prisma.platformFee.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    return { success: true, data: await app.prisma.platformFee.update({ where: { id }, data: body }) };
  });

  app.delete('/fees/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const exists = await app.prisma.platformFee.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    await app.prisma.platformFee.delete({ where: { id } });
    return { success: true, data: { deleted: id } };
  });

  /** Try a fee stack against any amount before committing to it. */
  app.post('/fees/preview', async (request) => {
    const { amountMinor, appliesTo } = z.object({
      amountMinor: z.number().int().min(0),
      appliesTo: z.enum(['CREDIT_PURCHASE', 'SUBSCRIPTION']).default('CREDIT_PURCHASE'),
    }).parse(request.body);
    const { priceWithFees } = await import('../services/pricing.js');
    return { success: true, data: await priceWithFees(app.prisma, amountMinor, appliesTo) };
  });

  // ── payment providers ───────────────────────────────────────────

  /** Secrets are never returned — only whether one is set. */
  const redact = (p: any) => ({
    id: p.id,
    provider: p.provider,
    label: p.label,
    isActive: p.isActive,
    isDefault: p.isDefault,
    testMode: p.testMode,
    supportedCurrencies: p.supportedCurrencies,
    publicKey: p.publicKey,
    hasSecretKey: !!p.secretKey,
    hasWebhookSecret: !!p.webhookSecret,
    config: p.config ?? null,
    updatedAt: p.updatedAt,
  });

  app.get('/payment-providers', async () => {
    const rows = await app.prisma.paymentProvider.findMany({ orderBy: { provider: 'asc' } });
    return {
      success: true,
      data: {
        providers: rows.map(redact),
        // What can be configured, so the UI does not carry its own list.
        available: [
          { provider: 'razorpay', label: 'Razorpay', currencies: ['INR'], fields: ['publicKey', 'secretKey', 'webhookSecret'] },
          { provider: 'stripe', label: 'Stripe', currencies: ['USD', 'INR', 'EUR', 'GBP'], fields: ['publicKey', 'secretKey', 'webhookSecret'] },
          { provider: 'payu', label: 'PayU', currencies: ['INR'], fields: ['publicKey', 'secretKey'] },
          { provider: 'cashfree', label: 'Cashfree', currencies: ['INR'], fields: ['publicKey', 'secretKey', 'webhookSecret'] },
          { provider: 'phonepe', label: 'PhonePe', currencies: ['INR'], fields: ['publicKey', 'secretKey'] },
          { provider: 'paytm', label: 'Paytm', currencies: ['INR'], fields: ['publicKey', 'secretKey'] },
        ],
      },
    };
  });

  app.put('/payment-providers/:provider', async (request, reply) => {
    const { provider } = z.object({ provider: z.string().min(2).max(30) }).parse(request.params);
    const body = z.object({
      label: z.string().min(1).max(60).optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      testMode: z.boolean().optional(),
      publicKey: z.string().max(300).optional(),
      // Omitting a secret leaves the stored one alone; sending "" clears it.
      secretKey: z.string().max(500).optional(),
      webhookSecret: z.string().max(500).optional(),
      supportedCurrencies: z.array(z.string().length(3)).optional(),
      config: z.record(z.any()).optional(),
    }).parse(request.body);

    const data: any = { ...body };
    // Secrets are encrypted with the same helper the WhatsApp tokens use, so
    // nothing here sits in the database in the clear.
    if (body.secretKey !== undefined) data.secretKey = body.secretKey ? encryptSecret(body.secretKey) : null;
    if (body.webhookSecret !== undefined) data.webhookSecret = body.webhookSecret ? encryptSecret(body.webhookSecret) : null;

    const saved = await app.prisma.paymentProvider.upsert({
      where: { provider },
      create: { provider, label: body.label || provider, ...data },
      update: data,
    });

    // Exactly one default, enforced here rather than hoped for.
    if (body.isDefault) {
      await app.prisma.paymentProvider.updateMany({
        where: { provider: { not: provider } },
        data: { isDefault: false },
      });
    }

    return reply.send({ success: true, data: redact(saved) });
  });

  /**
   * Confirms a provider's credentials actually work, rather than only that
   * something was typed into the field.
   */
  app.post('/payment-providers/:provider/test', async (request, reply) => {
    const { provider } = z.object({ provider: z.string() }).parse(request.params);
    const row = await app.prisma.paymentProvider.findUnique({ where: { provider } });
    if (!row) return reply.status(404).send({ success: false, error: { code: 'NOT_CONFIGURED' } });

    const secret = decryptIfPresent(row.secretKey);
    if (!row.publicKey || !secret) {
      return { success: true, data: { ok: false, reason: 'Key id and secret are both required.' } };
    }

    if (provider === 'razorpay') {
      try {
        const auth = Buffer.from(`${row.publicKey}:${secret}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/payments?count=1', {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (res.ok) return { success: true, data: { ok: true, message: 'Razorpay accepted these keys.' } };
        const body: any = await res.json().catch(() => ({}));
        return { success: true, data: { ok: false, reason: body?.error?.description || `Razorpay returned ${res.status}` } };
      } catch (e: any) {
        return { success: true, data: { ok: false, reason: e.message } };
      }
    }

    return {
      success: true,
      data: { ok: false, reason: `No live check implemented for ${provider} yet — keys are stored but unverified.` },
    };
  });
}

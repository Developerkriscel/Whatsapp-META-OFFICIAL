/**
 * Taking money for credits.
 *
 * What this replaces: POST /credits/purchase added the credits immediately and
 * left a "// In production: Create Stripe checkout session" comment where the
 * payment should have been. Anyone who could reach the endpoint could grant
 * themselves credits.
 *
 * The shape here is deliberate about who decides what:
 *
 *  - The server decides the price and the credit count when the order is
 *    created, and stores both. The browser is told the amount so it can show
 *    it, but is never believed about it afterwards.
 *  - Crediting is keyed on the provider's payment id, which is unique, so the
 *    browser callback and the webhook can both arrive and only one grant lands.
 *  - The webhook is the authority. The browser callback is a convenience so the
 *    page can update immediately; a purchase completes without it.
 */
import type { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { decryptIfPresent } from './credentialEncryption.js';

export interface CreateOrderInput {
  tenantId: string;
  packageId?: string;
  /** For a custom amount instead of a listed package. */
  credits?: number;
}

export interface CreatedOrder {
  orderId: string;
  provider: string;
  keyId: string;
  amountMinor: number;
  currency: string;
  credits: number;
  breakdown: any;
  testMode: boolean;
}

async function activeProvider(prisma: PrismaClient) {
  const provider = await prisma.paymentProvider.findFirst({
    where: { isActive: true, isDefault: true },
  }) ?? await prisma.paymentProvider.findFirst({ where: { isActive: true } });

  if (!provider) throw new Error('No payment provider is active. Configure one in Superadmin → Credits → Commerce.');

  const secret = decryptIfPresent(provider.secretKey);
  if (!provider.publicKey || !secret) {
    throw new Error(`${provider.label} is active but its keys are incomplete.`);
  }
  return { provider, secret };
}

/**
 * Creates an order with the gateway and records what it is worth.
 *
 * The credit count is resolved here, from the package or the custom amount, and
 * written to the row. Confirmation reads it back rather than accepting whatever
 * the client claims it bought.
 */
export async function createOrder(prisma: PrismaClient, input: CreateOrderInput): Promise<CreatedOrder> {
  const { provider, secret } = await activeProvider(prisma);
  const { quotePackage, priceWithFees } = await import('./pricing.js');

  let credits: number;
  let amountMinor: number;
  let breakdown: any;
  let packageId: string | null = null;

  if (input.packageId) {
    const pkg = await prisma.creditPackage.findFirst({ where: { id: input.packageId, isActive: true } });
    if (!pkg) throw new Error('That package is not available.');
    const quote = await quotePackage(prisma, pkg, 'IN');
    credits = pkg.credits;
    amountMinor = quote.totalMinor;
    breakdown = { fees: quote.fees, baseMinor: quote.baseMinor, totalMinor: quote.totalMinor };
    packageId = pkg.id;
  } else if (input.credits && input.credits > 0) {
    // A custom amount is priced from the same rate the packages use, so it
    // cannot be a cheaper route to the same credits.
    const cheapest = await prisma.creditPackage.findFirst({
      where: { isActive: true }, orderBy: { credits: 'asc' },
    });
    if (!cheapest) throw new Error('No packages are configured to price against.');
    const perCreditMinor = cheapest.priceMinor / cheapest.credits;
    const base = Math.round(perCreditMinor * input.credits);
    const quote = await priceWithFees(prisma, base, 'CREDIT_PURCHASE');
    credits = input.credits;
    amountMinor = quote.totalMinor;
    breakdown = { fees: quote.fees, baseMinor: quote.baseMinor, totalMinor: quote.totalMinor };
  } else {
    throw new Error('Provide a package or a credit amount.');
  }

  if (amountMinor < 100) throw new Error('The minimum charge is 1.00.');

  if (provider.provider !== 'razorpay') {
    throw new Error(`Checkout is implemented for Razorpay. ${provider.label} can be configured but not yet charged through.`);
  }

  const auth = Buffer.from(`${provider.publicKey}:${secret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountMinor,
      currency: 'INR',
      // Lets a payment be traced back to the tenant from the Razorpay dashboard.
      notes: { tenantId: input.tenantId, credits: String(credits) },
    }),
  });

  const body: any = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || `Razorpay refused the order (${res.status}).`);

  await prisma.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      provider: provider.provider,
      providerOrderId: body.id,
      credits,
      amountMinor,
      currency: 'INR',
      packageId,
      breakdown,
      status: 'CREATED',
    },
  });

  return {
    orderId: body.id,
    provider: provider.provider,
    keyId: provider.publicKey,
    amountMinor,
    currency: 'INR',
    credits,
    breakdown,
    testMode: provider.testMode,
  };
}

/**
 * Confirms a payment and grants the credits.
 *
 * Idempotent by construction: the payment id is unique on the row, so a second
 * call — the webhook after the browser, or a webhook Meta-style retry — finds
 * the order already PAID and grants nothing further.
 */
export async function confirmPayment(
  prisma: PrismaClient,
  args: { orderId: string; paymentId: string; signature?: string; viaWebhook?: boolean }
): Promise<{ credited: boolean; credits: number; balanceAfter?: number; reason?: string }> {
  const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: args.orderId } });
  if (!order) return { credited: false, credits: 0, reason: 'Unknown order.' };
  if (order.status === 'PAID') return { credited: false, credits: order.credits, reason: 'Already credited.' };

  const { provider, secret } = await activeProvider(prisma);

  // The browser callback carries a signature over order|payment. The webhook is
  // verified separately, against the raw body, before it reaches here.
  if (!args.viaWebhook) {
    if (!args.signature) return { credited: false, credits: 0, reason: 'Missing signature.' };
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${args.orderId}|${args.paymentId}`)
      .digest('hex');
    if (expected !== args.signature) {
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', failureReason: 'Signature did not match' },
      });
      return { credited: false, credits: 0, reason: 'Signature did not match.' };
    }
  }

  // Ask the gateway what it thinks happened rather than trusting the caller —
  // a valid signature proves the message came from us, not that money moved.
  const auth = Buffer.from(`${provider.publicKey}:${secret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/payments/${args.paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const payment: any = await res.json();
  if (!res.ok) return { credited: false, credits: 0, reason: payment?.error?.description || 'Could not read the payment.' };

  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    return { credited: false, credits: 0, reason: `Payment is ${payment.status}.` };
  }
  if (payment.amount !== order.amountMinor) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failureReason: `Paid ${payment.amount}, order was ${order.amountMinor}` },
    });
    return { credited: false, credits: 0, reason: 'The amount paid does not match the order.' };
  }

  // Claim the order before crediting. The unique payment id means a concurrent
  // second attempt fails here rather than granting the credits twice.
  try {
    await prisma.paymentOrder.update({
      where: { id: order.id, status: 'CREATED' },
      data: { status: 'PAID', providerPaymentId: args.paymentId, creditedAt: new Date() },
    });
  } catch {
    return { credited: false, credits: order.credits, reason: 'Already credited.' };
  }

  const { addCredits } = await import('./creditService.js');
  const result = await addCredits(
    prisma,
    order.tenantId,
    order.credits,
    'PURCHASE',
    order.providerOrderId,
    `Credit purchase — ${args.paymentId}`,
  );

  return { credited: true, credits: order.credits, balanceAfter: result.balanceAfter };
}

/** Verifies a Razorpay webhook against the raw request body. */
export async function verifyWebhookSignature(
  prisma: PrismaClient,
  rawBody: string,
  signature: string
): Promise<boolean> {
  const provider = await prisma.paymentProvider.findUnique({ where: { provider: 'razorpay' } });
  const secret = decryptIfPresent(provider?.webhookSecret);
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Constant-time compare; a length mismatch would throw otherwise.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

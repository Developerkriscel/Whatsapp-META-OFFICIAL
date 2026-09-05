/**
 * Credit Routes — Tenant billing & credit management with multi-currency support
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getRateCredits,
  creditsToUsd,
  deductCredits,
  addCredits,
  getTenantCreditInfo,
  META_RATES,
  COUNTRY_NAMES,
  MessageCategory,
} from '../services/creditService.js';
import {
  convertCurrency,
  convertMessageCost,
  getDisplayCurrencies,
  getCurrencyForCountry,
  formatCurrency,
  DISPLAY_CURRENCIES,
} from '../services/currencyService.js';

export async function registerCreditRoutes(app: FastifyInstance): Promise<void> {

  // ============================================
  // GET MY CREDITS — Tenant's credit balance & history
  // ============================================

  app.get('/credits', async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const info = await getTenantCreditInfo(app.prisma, request.authUser.tenantId);

    return {
      success: true,
      data: {
        balance: info?.balance || 0,
        totalPurchased: info?.totalPurchased || 0,
        totalUsed: info?.totalUsed || 0,
        balanceUsd: creditsToUsd(info?.balance || 0),
        transactions: (info?.transactions || []).map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          balanceAfter: t.balanceAfter,
          createdAt: t.createdAt,
        })),
      },
    };
  });

  // ============================================
  // GET RATES — Show all country rates (public, multi-currency)
  // ============================================

  app.get('/credits/rates', async (request, reply) => {
    const query = z.object({
      country: z.string().optional(),
      currency: z.string().optional(), // Display currency preference
    }).parse(request.query || {});

    // Default to INR (India) for display currency
    const displayCurrency = query.currency || 'INR';

    const rates = Object.entries(META_RATES)
      .filter(([code]) => !code.startsWith('ROW_'))
      .map(([code, ratesEntry]) => {
        // Convert costs to display currency
        const marketingConverted = convertMessageCost(ratesEntry.marketing, displayCurrency);
        const utilityConverted = convertMessageCost(ratesEntry.utility, displayCurrency);
        const authConverted = convertMessageCost(ratesEntry.auth, displayCurrency);
        const localCurrency = getCurrencyForCountry(code);

        return {
          countryCode: code,
          countryName: COUNTRY_NAMES[code] || code,
          billingCurrency: ratesEntry.billingCurrency,
          localCurrency,
          categories: {
            marketing: {
              credits: ratesEntry.marketing,
              usd: creditsToUsd(ratesEntry.marketing),
              localCurrency,
              localFormatted: convertMessageCost(ratesEntry.marketing, localCurrency).formatted,
              displayCurrency,
              displayFormatted: marketingConverted.formatted,
            },
            utility: {
              credits: ratesEntry.utility,
              usd: creditsToUsd(ratesEntry.utility),
              localCurrency,
              localFormatted: convertMessageCost(ratesEntry.utility, localCurrency).formatted,
              displayCurrency,
              displayFormatted: utilityConverted.formatted,
            },
            authentication: {
              credits: ratesEntry.auth,
              usd: creditsToUsd(ratesEntry.auth),
              localCurrency,
              localFormatted: convertMessageCost(ratesEntry.auth, localCurrency).formatted,
              displayCurrency,
              displayFormatted: authConverted.formatted,
            },
            session: {
              credits: 0,
              usd: 0,
              localFormatted: 'FREE',
              displayFormatted: 'FREE',
              note: 'Free within 24h service window',
            },
          },
        };
      })
      .sort((a, b) => a.countryName.localeCompare(b.countryName));

    // Filter by country if specified
    const filtered = query.country
      ? rates.filter(r =>
          r.countryCode.toLowerCase().includes(query.country!.toLowerCase()) ||
          r.countryName.toLowerCase().includes(query.country!.toLowerCase())
        )
      : rates;

    return {
      success: true,
      data: filtered,
      meta: {
        displayCurrency,
        currencySymbol: DISPLAY_CURRENCIES[displayCurrency]?.symbol || '$',
        availableCurrencies: getDisplayCurrencies(),
      },
    };
  });

  // ============================================
  // GET CURRENCIES — List all supported display currencies
  // ============================================

  app.get('/credits/currencies', async (request, reply) => {
    const currencies = getDisplayCurrencies();
    return {
      success: true,
      data: currencies,
    };
  });

  // ============================================
  // GET CREDITS/RATES/:countryCode — Rate for specific country
  // ============================================

  app.get('/credits/rates/:countryCode', async (request, reply) => {
    const { countryCode } = z.object({
      countryCode: z.string().min(2).max(3),
    }).parse(request.params);

    const query = z.object({
      currency: z.string().optional(),
    }).parse(request.query || {});

    const displayCurrency = query.currency || 'USD';
    const normalized = countryCode.toUpperCase();
    const rates = META_RATES[normalized] || META_RATES.OTHER;
    const localCurrency = getCurrencyForCountry(normalized);

    return {
      success: true,
      data: {
        countryCode: normalized,
        countryName: COUNTRY_NAMES[normalized] || normalized,
        billingCurrency: rates.billingCurrency,
        localCurrency,
        displayCurrency,
        categories: {
          marketing: {
            credits: rates.marketing,
            usd: creditsToUsd(rates.marketing),
            local: convertMessageCost(rates.marketing, localCurrency),
            display: convertMessageCost(rates.marketing, displayCurrency),
          },
          utility: {
            credits: rates.utility,
            usd: creditsToUsd(rates.utility),
            local: convertMessageCost(rates.utility, localCurrency),
            display: convertMessageCost(rates.utility, displayCurrency),
          },
          authentication: {
            credits: rates.auth,
            usd: creditsToUsd(rates.auth),
            local: convertMessageCost(rates.auth, localCurrency),
            display: convertMessageCost(rates.auth, displayCurrency),
          },
          session: {
            credits: 0,
            usd: 0,
            local: { formatted: 'FREE', note: '24h customer service window' },
            display: { formatted: 'FREE', note: '24h customer service window' },
          },
        },
        pricingNote: 'Meta charges in local currency. Display currency for reference.',
      },
    };
  });

  // ============================================
  // PURCHASE CREDITS — Buy credit pack
  // ============================================

  /**
   * POST /credits/purchase
   *
   * This used to call addCredits directly with a comment where the payment
   * should have been, so anyone who could reach it could grant themselves
   * credits. It now refuses and names the endpoints that actually take money.
   */
  app.post('/credits/purchase', { preHandler: [app.requirePermission('billing', 'update')] }, async (request, reply) => {
    return reply.status(410).send({
      success: false,
      error: {
        code: 'USE_CHECKOUT',
        message: 'Credits are granted only against a confirmed payment. Start a purchase with POST /credits/checkout/create-order.',
      },
    });
  });

  app.post('/credits/purchase-legacy-disabled', { preHandler: [app.requirePermission('billing', 'update')] }, async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      packId: z.string().optional(),
      credits: z.number().optional(),
      paymentMethodId: z.string().optional(),
      currency: z.string().optional(),
    }).parse(request.body);

    let creditsToAdd = 0;
    let description = '';
    let priceUsd = 0;
    let localCurrency = 'USD';

    if (body.packId) {
      const pack = await app.prisma.creditPack.findUnique({
        where: { id: body.packId },
      });
      if (!pack || !pack.isActive) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PACK', message: 'Credit pack not found or inactive' }
        });
      }
      creditsToAdd = pack.credits;
      priceUsd = Number(pack.priceUsd);
      localCurrency = body.currency || 'USD';
      description = `Purchased ${pack.name}`;
    } else if (body.credits) {
      creditsToAdd = body.credits;
      priceUsd = creditsToUsd(creditsToAdd);
      localCurrency = body.currency || 'USD';
      description = `Purchased ${creditsToAdd} credits`;
    } else {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_AMOUNT', message: 'Provide packId or credits amount' }
      });
    }

    // In production: Create Stripe checkout session
    // For now: instant credit (mock payment)

    const result = await addCredits(
      app.prisma,
      request.authUser.tenantId,
      creditsToAdd,
      'PURCHASE',
      body.packId || 'custom',
      description,
    );

    return {
      success: true,
      data: {
        creditsAdded: creditsToAdd,
        balanceAfter: result.balanceAfter,
        priceUsd,
        localCurrency,
        localFormatted: formatCurrency(priceUsd, localCurrency, { showSymbol: true }),
        // In production: return Stripe checkout URL instead
        checkoutUrl: null,
        instant: true,
      },
    };
  });

  // ============================================
  // ADD BONUS CREDITS — Free/trial credits
  // ============================================

  app.post('/credits/bonus', { preHandler: [app.requirePermission('billing', 'update')] }, async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      amount: z.number().min(1),
      description: z.string().optional(),
    }).parse(request.body);

    const result = await addCredits(
      app.prisma,
      request.authUser.tenantId,
      body.amount,
      'BONUS',
      undefined,
      body.description || 'Bonus credits',
    );

    return {
      success: true,
      data: {
        creditsAdded: body.amount,
        balanceAfter: result.balanceAfter,
        creditsUsd: creditsToUsd(body.amount),
      },
    };
  });

  // ============================================
  // CHECKOUT -- real money
  // ============================================

  /**
   * POST /credits/checkout/create-order
   *
   * The server fixes the price and the credit count here and stores both. The
   * browser is told the amount so it can render the gateway, and is never
   * believed about it afterwards.
   */
  app.post('/credits/checkout/create-order', { preHandler: [app.requirePermission('billing', 'update')] }, async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const body = z.object({
      packageId: z.string().optional(),
      credits: z.number().int().positive().max(10000000).optional(),
    }).parse(request.body);

    try {
      const { createOrder } = await import('../services/payments.js');
      const order = await createOrder(app.prisma, {
        tenantId: request.authUser.tenantId,
        packageId: body.packageId,
        credits: body.credits,
      });
      return { success: true, data: order };
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CHECKOUT_FAILED', message: err.message },
      });
    }
  });

  /**
   * POST /credits/checkout/confirm
   *
   * Called by the browser when the gateway hands control back. Convenience
   * only: the webhook confirms the same purchase independently, so a closed tab
   * does not lose someone their credits.
   */
  app.post('/credits/checkout/confirm', { preHandler: [app.requirePermission('billing', 'update')] }, async (request, reply) => {
    const body = z.object({
      orderId: z.string(),
      paymentId: z.string(),
      signature: z.string(),
    }).parse(request.body);

    const { confirmPayment } = await import('../services/payments.js');
    const result = await confirmPayment(app.prisma, {
      orderId: body.orderId,
      paymentId: body.paymentId,
      signature: body.signature,
    });

    if (!result.credited && result.reason && !result.reason.startsWith('Already')) {
      return reply.status(400).send({ success: false, error: { code: 'NOT_CREDITED', message: result.reason } });
    }
    return { success: true, data: result };
  });

  /** Recent purchases, for the receipt list on the Credits page. */
  app.get('/credits/orders', async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const orders = await app.prisma.paymentOrder.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, provider: true, providerOrderId: true, credits: true,
        amountMinor: true, currency: true, status: true, createdAt: true,
        creditedAt: true, failureReason: true, breakdown: true,
      },
    });
    return { success: true, data: orders };
  });
}

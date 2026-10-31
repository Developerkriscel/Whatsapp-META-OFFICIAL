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
import { getCurrencyContext } from './currency.js';
import { EXCHANGE_RATES } from './currencyService.js';
import { CASHFREE_PLAN_GST_RATE_PERCENT, quoteCashfreePlanPrice } from './cashfreePlanPricing.js';

export interface CreateOrderInput {
  tenantId: string;
  packageId?: string;
  /** For a custom amount instead of a listed package. */
  credits?: number;
  customer?: CheckoutCustomer;
}

export interface CreatePlanOrderInput {
  tenantId: string;
  planId: string;
  planTier: string;
  planName: string;
  interval: 'monthly' | 'annual';
  amountUsd: number;
  customer: CheckoutCustomer;
}

export interface CreatedOrder {
  orderId: string;
  provider: string;
  keyId?: string;
  paymentSessionId?: string;
  amountMinor: number;
  currency: string;
  credits: number;
  breakdown: any;
  testMode: boolean;
}

interface CheckoutCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const CASHFREE_API_VERSION = '2023-08-01';

function cashfreeErrorMessage(body: any, status: number): string {
  const details = [body?.message, body?.type, body?.code].filter(Boolean).join(' — ');
  const normalizedDetails = details.toLowerCase();
  if (normalizedDetails.includes('product') &&
      (normalizedDetails.includes('activat') || normalizedDetails.includes('enable'))) {
    return 'Cashfree Payment Gateway is not activated for this merchant account. Activate PG in the Cashfree Dashboard, then retry.';
  }
  return details || `Cashfree refused the order (${status}).`;
}

function cashfreeBaseUrl(testMode: boolean): string {
  return testMode ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';
}

function cashfreeHeaders(publicKey: string, secret: string): Record<string, string> {
  return {
    'x-api-version': CASHFREE_API_VERSION,
    'x-client-id': publicKey,
    'x-client-secret': secret,
    'Content-Type': 'application/json',
  };
}

function planTermEnd(start: Date, interval: 'monthly' | 'annual'): Date {
  const months = interval === 'annual' ? 12 : 1;
  const monthIndex = start.getMonth() + months;
  const year = start.getFullYear() + Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const day = Math.min(start.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
}

async function activeProvider(prisma: PrismaClient) {
  const candidates = await prisma.paymentProvider.findMany({
    where: { isActive: true },
    orderBy: { isDefault: 'desc' },
  });

  if (!candidates.length) throw new Error('No payment provider is active. Configure one in Superadmin → Credits → Commerce.');

  for (const provider of candidates) {
    try {
      const secret = decryptIfPresent(provider.secretKey);
      const publicKey = provider.publicKey;
      if (!publicKey || !secret) continue;
      return { provider, publicKey, secret };
    } catch {
      // Encrypted with a stale key — skip to the next provider.
    }
  }

  throw new Error('No payment provider has valid credentials. Re-save the keys in Superadmin → Credits → Commerce.');
}

/**
 * Creates an order with the gateway and records what it is worth.
 *
 * The credit count is resolved here, from the package or the custom amount, and
 * written to the row. Confirmation reads it back rather than accepting whatever
 * the client claims it bought.
 */
export async function createOrder(prisma: PrismaClient, input: CreateOrderInput): Promise<CreatedOrder> {
  const { provider, publicKey, secret } = await activeProvider(prisma);
  const { quotePackage, priceWithFees } = await import('./pricing.js');

  let credits: number;
  let amountMinor: number;
  let breakdown: any;
  let packageId: string | null = null;

  if (input.packageId) {
    const pkg = await prisma.creditPackage.findFirst({ where: { id: input.packageId, isActive: true } });
    if (!pkg) throw new Error('That package is not available.');
    const quote = await quotePackage(prisma, pkg, 'IN');
    credits = pkg.priceMinor;
    amountMinor = quote.totalMinor;
    breakdown = { fees: quote.fees, baseMinor: quote.baseMinor, totalMinor: quote.totalMinor };
    packageId = pkg.id;
  } else if (input.credits && input.credits > 0) {
    // Custom input is supplied in paise by the website: ₹100 is 10,000 paise
    // in the ledger, which is displayed to the customer as 100 credits.
    const quote = await priceWithFees(prisma, input.credits, 'CREDIT_PURCHASE');
    credits = input.credits;
    amountMinor = quote.totalMinor;
    breakdown = { fees: quote.fees, baseMinor: quote.baseMinor, totalMinor: quote.totalMinor };
  } else {
    throw new Error('Provide a package or a credit amount.');
  }

  if (amountMinor < 100) throw new Error('The minimum charge is 1.00.');

  let providerOrderId: string;
  let paymentSessionId: string | undefined;
  let responseBody: any;

  if (provider.provider === 'razorpay') {
    const auth = Buffer.from(`${publicKey}:${secret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountMinor,
        currency: 'INR',
        notes: { tenantId: input.tenantId, credits: String(credits) },
      }),
    });

    responseBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(responseBody?.error?.description || `Razorpay refused the order (${res.status}).`);
    }
    providerOrderId = responseBody.id;
  } else if (provider.provider === 'cashfree') {
    const customer = input.customer;
    const phone = customer?.phone?.replace(/\D/g, '');
    if (!customer || !phone || phone.length < 10 || phone.length > 15) {
      throw new Error('Add a valid phone number to your user profile before paying with Cashfree.');
    }

    const orderId = `cf_${crypto.randomUUID().replace(/-/g, '')}`;
    const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    const baseUrl = cashfreeBaseUrl(provider.testMode);
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: cashfreeHeaders(publicKey, secret),
      body: JSON.stringify({
        order_id: orderId,
        order_amount: Number((amountMinor / 100).toFixed(2)),
        order_currency: 'INR',
        customer_details: {
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: phone,
        },
        order_meta: {
          return_url: `${appUrl}/credits?cashfree_order_id={order_id}`,
        },
        order_note: `Credit purchase (${credits} credits)`,
      }),
    });

    responseBody = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cashfreeErrorMessage(responseBody, res.status));
    providerOrderId = responseBody.order_id;
    paymentSessionId = responseBody.payment_session_id;
    if (!providerOrderId || !paymentSessionId) {
      throw new Error('Cashfree created an incomplete order response. Check the Cashfree API configuration.');
    }
  } else {
    throw new Error(`Checkout is not implemented for ${provider.label}.`);
  }

  await prisma.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      provider: provider.provider,
      providerOrderId,
      credits,
      amountMinor,
      currency: 'INR',
      packageId,
      breakdown,
      status: 'CREATED',
    },
  });

  return {
    orderId: providerOrderId,
    provider: provider.provider,
    ...(provider.provider === 'razorpay' ? { keyId: publicKey } : {}),
    ...(paymentSessionId ? { paymentSessionId } : {}),
    amountMinor,
    currency: 'INR',
    credits,
    breakdown,
    testMode: provider.testMode,
  };
}

export async function createRazorpayPlanOrder(
  prisma: PrismaClient,
  input: CreatePlanOrderInput,
): Promise<{ orderId: string; provider: string; keyId: string; amountMinor: number; currency: string; testMode: boolean }> {
  const { provider, publicKey, secret } = await activeProvider(prisma);
  if (provider.provider !== 'razorpay') {
    throw new Error('Razorpay is not the active payment provider.');
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error('This plan does not have a purchasable price.');
  }

  const currency = await getCurrencyContext(prisma);
  const usdToInr = currency.currency === 'INR' ? currency.fxRate : EXCHANGE_RATES.INR;
  const quote = quoteCashfreePlanPrice(input.amountUsd, usdToInr);
  const { baseMinor, gstMinor, totalMinor: amountMinor } = quote;
  if (amountMinor < 100) throw new Error('The minimum charge is ₹1.00.');

  const auth = Buffer.from(`${publicKey}:${secret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountMinor,
      currency: 'INR',
      notes: {
        tenantId: input.tenantId,
        planId: input.planId,
        planTier: input.planTier,
        interval: input.interval,
        kind: 'PLAN_PURCHASE',
      },
    }),
  });

  const responseBody: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(responseBody?.error?.description || `Razorpay refused the order (${res.status}).`);
  }
  const providerOrderId = responseBody.id;

  await prisma.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      provider: 'razorpay',
      providerOrderId,
      credits: 0,
      amountMinor,
      currency: 'INR',
      status: 'CREATED',
      breakdown: {
        kind: 'PLAN_PURCHASE',
        planId: input.planId,
        planTier: input.planTier,
        interval: input.interval,
        amountUsd: input.amountUsd,
        usdToInr,
        baseMinor,
        gstRatePercent: CASHFREE_PLAN_GST_RATE_PERCENT,
        gstMinor,
        totalMinor: amountMinor,
      },
    },
  });

  return {
    orderId: providerOrderId,
    provider: 'razorpay',
    keyId: publicKey,
    amountMinor,
    currency: 'INR',
    testMode: provider.testMode,
  };
}

export async function createCashfreePlanOrder(
  prisma: PrismaClient,
  input: CreatePlanOrderInput,
): Promise<{ orderId: string; provider: string; paymentSessionId: string; amountMinor: number; currency: string; testMode: boolean }> {
  const { provider, publicKey, secret } = await activeProvider(prisma);
  if (provider.provider !== 'cashfree') {
    throw new Error('Cashfree is not the active payment provider.');
  }
  if (!input.customer.phone) {
    throw new Error('Add a valid phone number to your user profile before paying with Cashfree.');
  }
  const phone = input.customer.phone.replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 15) {
    throw new Error('Add a valid phone number to your user profile before paying with Cashfree.');
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error('This plan does not have a purchasable price.');
  }

  const currency = await getCurrencyContext(prisma);
  const usdToInr = currency.currency === 'INR' ? currency.fxRate : EXCHANGE_RATES.INR;
  const quote = quoteCashfreePlanPrice(input.amountUsd, usdToInr);
  const { baseMinor, gstMinor, totalMinor: amountMinor } = quote;
  if (amountMinor < 100) throw new Error('The minimum charge is ₹1.00.');

  const orderId = `cf_plan_${crypto.randomUUID().replace(/-/g, '')}`;
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const response = await fetch(`${cashfreeBaseUrl(provider.testMode)}/orders`, {
    method: 'POST',
    headers: cashfreeHeaders(publicKey, secret),
    body: JSON.stringify({
      order_id: orderId,
      order_amount: Number((amountMinor / 100).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: input.tenantId,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: phone,
      },
      order_meta: {
        return_url: `${appUrl}/billing?cashfree_order_id={order_id}`,
      },
      order_note: `${input.planName} plan (${input.interval})`,
    }),
  });
  const responseBody: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(cashfreeErrorMessage(responseBody, response.status));
  if (responseBody.order_id !== orderId || !responseBody.payment_session_id) {
    throw new Error('Cashfree created an incomplete plan order response.');
  }

  await prisma.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      provider: 'cashfree',
      providerOrderId: orderId,
      credits: 0,
      amountMinor,
      currency: 'INR',
      status: 'CREATED',
      breakdown: {
        kind: 'PLAN_PURCHASE',
        planId: input.planId,
        planTier: input.planTier,
        interval: input.interval,
        amountUsd: input.amountUsd,
        usdToInr,
        baseMinor,
        gstRatePercent: CASHFREE_PLAN_GST_RATE_PERCENT,
        gstMinor,
        totalMinor: amountMinor,
      },
    },
  });

  return {
    orderId,
    provider: 'cashfree',
    paymentSessionId: responseBody.payment_session_id,
    amountMinor,
    currency: 'INR',
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

  const provider = await prisma.paymentProvider.findUnique({ where: { provider: order.provider } });
  const publicKey = provider?.publicKey;
  const secret = decryptIfPresent(provider?.secretKey);
  if (!publicKey || !secret) return { credited: false, credits: 0, reason: 'The payment provider is not configured.' };
  if (order.provider !== 'razorpay') {
    return { credited: false, credits: 0, reason: `Unsupported payment provider: ${order.provider}.` };
  }

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
  const auth = Buffer.from(`${publicKey}:${secret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/payments/${args.paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const payment: any = await res.json().catch(() => ({}));
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

  const breakdown = order.breakdown as { kind?: string; planId?: string; interval?: 'monthly' | 'annual' } | null;
  if (breakdown?.kind === 'PLAN_PURCHASE') {
    return activateRazorpayPlan(prisma, order, args.paymentId, breakdown);
  }

  return grantPaymentCredits(prisma, order, args.paymentId);
}

async function activateRazorpayPlan(
  prisma: PrismaClient,
  order: { id: string; tenantId: string; providerOrderId: string; credits: number },
  paymentId: string,
  breakdown: { planId?: string; interval?: 'monthly' | 'annual' },
): Promise<{ credited: boolean; credits: number; balanceAfter?: number; activated?: boolean; reason?: string }> {
  if (!breakdown.planId || !breakdown.interval) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failureReason: 'Plan purchase details are missing' },
    });
    return { credited: false, credits: 0, reason: 'Plan purchase details are missing.' };
  }

  const plan = await prisma.plan.findUnique({ where: { id: breakdown.planId } });
  if (!plan || !plan.isActive || !plan.isPublic) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failureReason: 'The purchased plan is no longer available' },
    });
    return { credited: false, credits: 0, reason: 'The purchased plan is no longer available.' };
  }

  const planExpiresAt = planTermEnd(new Date(), breakdown.interval);

  const activated = await prisma.$transaction(async (tx) => {
    const claim = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: 'CREATED' },
      data: { status: 'PAID', providerPaymentId: paymentId, creditedAt: new Date() },
    });
    if (claim.count !== 1) return false;
    await tx.tenant.update({
      where: { id: order.tenantId },
      data: {
        planId: plan.id,
        planExpiresAt,
        status: 'ACTIVE',
        isOnTrial: false,
        trialEndsAt: null,
        stripeSubId: null,
      },
    });
    return true;
  });

  return activated
    ? { credited: true, credits: 0, activated: true, reason: `Plan active until ${planExpiresAt.toISOString()}.` }
    : { credited: false, credits: 0, reason: 'Already confirmed.' };
}

async function grantPaymentCredits(
  prisma: PrismaClient,
  order: { id: string; tenantId: string; providerOrderId: string; credits: number },
  paymentId: string,
): Promise<{ credited: boolean; credits: number; balanceAfter?: number; reason?: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: 'CREATED' },
      data: { status: 'PAID', providerPaymentId: paymentId, creditedAt: new Date() },
    });
    if (claimed.count !== 1) return { credited: false as const };

    const creditAccount = await tx.tenantCredit.upsert({
      where: { tenantId: order.tenantId },
      create: {
        tenantId: order.tenantId,
        balance: order.credits,
        totalPurchased: order.credits,
        totalUsed: 0,
      },
      update: {
        balance: { increment: order.credits },
        totalPurchased: { increment: order.credits },
      },
    });
    await tx.tenantCreditTransaction.create({
      data: {
        creditId: creditAccount.id,
        type: 'PURCHASE',
        amount: order.credits,
        referenceId: order.providerOrderId,
        referenceType: 'PURCHASE',
        description: `Credit purchase — ${paymentId}`,
        balanceAfter: creditAccount.balance,
      },
    });

    return { credited: true as const, balanceAfter: creditAccount.balance };
  });

  if (!result.credited) {
    return { credited: false, credits: order.credits, reason: 'Already credited.' };
  }
  return { credited: true, credits: order.credits, balanceAfter: result.balanceAfter };
}

/**
 * Confirms Cashfree by querying its API; the browser return URL is only a hint
 * and never treated as proof that payment succeeded.
 */
export async function confirmCashfreeOrder(
  prisma: PrismaClient,
  orderId: string,
): Promise<{ credited: boolean; credits: number; balanceAfter?: number; reason?: string }> {
  const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: orderId } });
  if (!order || order.provider !== 'cashfree') return { credited: false, credits: 0, reason: 'Unknown Cashfree order.' };
  if (order.status === 'PAID') return { credited: false, credits: order.credits, reason: 'Already credited.' };

  const provider = await prisma.paymentProvider.findUnique({ where: { provider: 'cashfree' } });
  const publicKey = provider?.publicKey;
  const secret = decryptIfPresent(provider?.secretKey);
  if (!provider || !publicKey || !secret) {
    return { credited: false, credits: 0, reason: 'Cashfree credentials are not configured.' };
  }

  const baseUrl = cashfreeBaseUrl(provider.testMode);
  const headers = cashfreeHeaders(publicKey, secret);
  const orderResponse = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, { headers });
  const cashfreeOrder: any = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) {
    return { credited: false, credits: 0, reason: cashfreeErrorMessage(cashfreeOrder, orderResponse.status) };
  }
  if (cashfreeOrder.order_status !== 'PAID') {
    return { credited: false, credits: order.credits, reason: `Payment is ${cashfreeOrder.order_status || 'pending'}.` };
  }

  const paymentsResponse = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, { headers });
  const payments: any = await paymentsResponse.json().catch(() => ({}));
  if (!paymentsResponse.ok) {
    return { credited: false, credits: 0, reason: cashfreeErrorMessage(payments, paymentsResponse.status) };
  }
  const successfulPayment = (Array.isArray(payments) ? payments : [])
    .find((payment: any) => payment.payment_status === 'SUCCESS');
  if (!successfulPayment?.cf_payment_id) {
    return { credited: false, credits: order.credits, reason: 'Cashfree has not confirmed a successful payment yet.' };
  }

  const paidMinor = Math.round(Number(successfulPayment.payment_amount) * 100);
  const orderMinor = Math.round(Number(cashfreeOrder.order_amount) * 100);
  if (paidMinor !== order.amountMinor || orderMinor !== order.amountMinor ||
      cashfreeOrder.order_currency !== order.currency) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failureReason: 'Cashfree payment amount or currency did not match the order' },
    });
    return { credited: false, credits: 0, reason: 'The amount paid does not match the order.' };
  }

  const paymentId = String(successfulPayment.cf_payment_id);
  const breakdown = order.breakdown as { kind?: string; planId?: string; interval?: 'monthly' | 'annual' } | null;
  if (breakdown?.kind === 'PLAN_PURCHASE') {
    if (!breakdown.planId || !breakdown.interval) {
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', failureReason: 'Plan purchase details are missing' },
      });
      return { credited: false, credits: 0, reason: 'Plan purchase details are missing.' };
    }

    const plan = await prisma.plan.findUnique({ where: { id: breakdown.planId } });
    if (!plan || !plan.isActive || !plan.isPublic) {
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', failureReason: 'The purchased plan is no longer available' },
      });
      return { credited: false, credits: 0, reason: 'The purchased plan is no longer available.' };
    }

    const planExpiresAt = planTermEnd(new Date(), breakdown.interval);

    const activated = await prisma.$transaction(async (tx) => {
      const claim = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: 'CREATED' },
        data: { status: 'PAID', providerPaymentId: paymentId, creditedAt: new Date() },
      });
      if (claim.count !== 1) return false;
      await tx.tenant.update({
        where: { id: order.tenantId },
        data: {
          planId: plan.id,
          planExpiresAt,
          status: 'ACTIVE',
          isOnTrial: false,
          trialEndsAt: null,
          stripeSubId: null,
        },
      });
      return true;
    });
    return activated
      ? { credited: true, credits: 0, reason: `Plan active until ${planExpiresAt.toISOString()}.` }
      : { credited: false, credits: 0, reason: 'Already confirmed.' };
  }

  return grantPaymentCredits(prisma, order, paymentId);
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

/** Cashfree signs the original timestamp concatenated with the raw body. */
export async function verifyCashfreeWebhookSignature(
  prisma: PrismaClient,
  rawBody: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  const provider = await prisma.paymentProvider.findUnique({ where: { provider: 'cashfree' } });
  const secret = decryptIfPresent(provider?.secretKey);
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

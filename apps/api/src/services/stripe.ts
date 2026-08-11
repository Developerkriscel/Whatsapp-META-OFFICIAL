/**
 * Stripe Service - Full integration for billing
 */

import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const isMockMode = process.env.STRIPE_MOCK_MODE === 'true';

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});

export const STRIPE_CONFIG = {
  isMockMode,
  priceIds: {
    starterMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    starterAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    growthMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    growthAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    businessMonthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    businessAnnual: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

// ============================================
// Customer Management
// ============================================

export async function createCustomer(params: {
  email: string;
  name: string;
  tenantId: string;
}): Promise<Stripe.Customer> {
  if (isMockMode) {
    return {
      id: `cus_mock_${Date.now()}`,
      email: params.email,
      name: params.name,
      metadata: { tenantId: params.tenantId },
    } as unknown as Stripe.Customer;
  }

  return await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: { tenantId: params.tenantId },
  });
}

export async function getCustomer(customerId: string): Promise<Stripe.Customer | null> {
  if (isMockMode) {
    return { id: customerId } as Stripe.Customer;
  }

  try {
    return await stripe.customers.retrieve(customerId) as Stripe.Customer;
  } catch {
    return null;
  }
}

// ============================================
// Checkout Sessions
// ============================================

export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  tenantId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  if (isMockMode) {
    const mockSessionId = `cs_mock_${Date.now()}`;
    return {
      url: `${params.successUrl}?session_id=${mockSessionId}`,
      sessionId: mockSessionId,
    };
  }

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { tenantId: params.tenantId },
    subscription_data: {
      metadata: { tenantId: params.tenantId },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  });

  return { url: session.url || '', sessionId: session.id };
}

// ============================================
// Subscriptions
// ============================================

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  if (isMockMode) {
    return null;
  }

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  if (isMockMode) {
    return { id: subscriptionId, status: 'canceled' } as Stripe.Subscription;
  }

  return await stripe.subscriptions.cancel(subscriptionId);
}

export async function updateSubscription(params: {
  subscriptionId: string;
  newPriceId: string;
}): Promise<Stripe.Subscription> {
  if (isMockMode) {
    return {
      id: params.subscriptionId,
      items: { data: [{ price: { id: params.newPriceId } }] },
    } as any;
  }

  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const itemId = subscription.items.data[0]?.id;

  return await stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: itemId, price: params.newPriceId }],
    proration_behavior: 'create_prorations',
  });
}

// ============================================
// Customer Portal
// ============================================

export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (isMockMode) {
    return { url: params.returnUrl };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

// ============================================
// Invoices
// ============================================

export async function listInvoices(customerId: string, limit = 10): Promise<Stripe.Invoice[]> {
  if (isMockMode) {
    return [];
  }

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
}

export async function getUpcomingInvoice(customerId: string): Promise<Stripe.UpcomingInvoice | null> {
  if (isMockMode) {
    return null;
  }

  try {
    return await stripe.invoices.retrieveUpcoming({ customer: customerId });
  } catch {
    return null;
  }
}

// ============================================
// Webhook Helpers
// ============================================

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (isMockMode) {
    return JSON.parse(payload.toString());
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    STRIPE_CONFIG.webhookSecret
  );
}

export function mapPriceToPlanTier(priceId: string): string {
  const { priceIds } = STRIPE_CONFIG;

  if (priceId === priceIds.starterMonthly || priceId === priceIds.starterAnnual) {
    return 'STARTER';
  }
  if (priceId === priceIds.growthMonthly || priceId === priceIds.growthAnnual) {
    return 'GROWTH';
  }
  if (priceId === priceIds.businessMonthly || priceId === priceIds.businessAnnual) {
    return 'BUSINESS';
  }
  return 'STARTER';
}

export function mapPlanTierToPriceId(tier: string, interval: 'monthly' | 'annual' = 'monthly'): string {
  const { priceIds } = STRIPE_CONFIG;
  const key = `${tier.toLowerCase()}${interval === 'monthly' ? 'Monthly' : 'Annual'}` as keyof typeof priceIds;
  return priceIds[key] || '';
}

// ============================================
// Usage
// ============================================

export async function reportUsage(params: {
  subscriptionItemId: string;
  quantity: number;
}): Promise<Stripe.UsageRecord> {
  if (isMockMode) {
    return { id: `mbur_mock_${Date.now()}` } as any;
  }

  return await stripe.subscriptionItems.createUsageRecord(
    params.subscriptionItemId,
    { quantity: params.quantity, timestamp: Math.floor(Date.now() / 1000) }
  );
}
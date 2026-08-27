/**
 * Stripe Service - Full integration for billing
 */
import Stripe from 'stripe';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const isMockMode = process.env.STRIPE_MOCK_MODE === 'true';
export const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
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
export async function createCustomer(params) {
    if (isMockMode) {
        return {
            id: `cus_mock_${Date.now()}`,
            email: params.email,
            name: params.name,
            metadata: { tenantId: params.tenantId },
        };
    }
    return await stripe.customers.create({
        email: params.email,
        name: params.name,
        metadata: { tenantId: params.tenantId },
    });
}
export async function getCustomer(customerId) {
    if (isMockMode) {
        return { id: customerId };
    }
    try {
        return await stripe.customers.retrieve(customerId);
    }
    catch {
        return null;
    }
}
// ============================================
// Checkout Sessions
// ============================================
export async function createCheckoutSession(params) {
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
export async function getSubscription(subscriptionId) {
    if (isMockMode) {
        return null;
    }
    try {
        return await stripe.subscriptions.retrieve(subscriptionId);
    }
    catch {
        return null;
    }
}
export async function cancelSubscription(subscriptionId) {
    if (isMockMode) {
        return { id: subscriptionId, status: 'active', cancel_at_period_end: true };
    }
    // Schedule cancellation for period end rather than cancelling immediately —
    // the customer keeps access through what they already paid for.
    return await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}
export async function updateSubscription(params) {
    if (isMockMode) {
        return {
            id: params.subscriptionId,
            items: { data: [{ price: { id: params.newPriceId } }] },
        };
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
export async function createPortalSession(params) {
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
export async function listInvoices(customerId, limit = 10) {
    if (isMockMode) {
        return [];
    }
    const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
    });
    return invoices.data;
}
export async function getUpcomingInvoice(customerId) {
    if (isMockMode) {
        return null;
    }
    try {
        return await stripe.invoices.retrieveUpcoming({ customer: customerId });
    }
    catch {
        return null;
    }
}
// ============================================
// Webhook Helpers
// ============================================
export function verifyWebhookSignature(payload, signature) {
    if (isMockMode) {
        return JSON.parse(payload.toString());
    }
    return stripe.webhooks.constructEvent(payload, signature, STRIPE_CONFIG.webhookSecret);
}
export function mapPriceToPlanTier(priceId) {
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
export function mapPlanTierToPriceId(tier, interval = 'monthly') {
    const { priceIds } = STRIPE_CONFIG;
    const key = `${tier.toLowerCase()}${interval === 'monthly' ? 'Monthly' : 'Annual'}`;
    return priceIds[key] || '';
}
// ============================================
// Usage
// ============================================
export async function reportUsage(params) {
    if (isMockMode) {
        return { id: `mbur_mock_${Date.now()}` };
    }
    return await stripe.subscriptionItems.createUsageRecord(params.subscriptionItemId, { quantity: params.quantity, timestamp: Math.floor(Date.now() / 1000) });
}
//# sourceMappingURL=stripe.js.map
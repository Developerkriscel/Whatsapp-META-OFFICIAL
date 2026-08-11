/**
 * Stripe Service - Full integration for billing
 */
import Stripe from 'stripe';
export declare const stripe: Stripe;
export declare const STRIPE_CONFIG: {
    isMockMode: boolean;
    priceIds: {
        starterMonthly: string | undefined;
        starterAnnual: string | undefined;
        growthMonthly: string | undefined;
        growthAnnual: string | undefined;
        businessMonthly: string | undefined;
        businessAnnual: string | undefined;
    };
    webhookSecret: string;
};
export declare function createCustomer(params: {
    email: string;
    name: string;
    tenantId: string;
}): Promise<Stripe.Customer>;
export declare function getCustomer(customerId: string): Promise<Stripe.Customer | null>;
export declare function createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    tenantId: string;
    successUrl: string;
    cancelUrl: string;
}): Promise<{
    url: string;
    sessionId: string;
}>;
export declare function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null>;
export declare function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
export declare function updateSubscription(params: {
    subscriptionId: string;
    newPriceId: string;
}): Promise<Stripe.Subscription>;
export declare function createPortalSession(params: {
    customerId: string;
    returnUrl: string;
}): Promise<{
    url: string;
}>;
export declare function listInvoices(customerId: string, limit?: number): Promise<Stripe.Invoice[]>;
export declare function getUpcomingInvoice(customerId: string): Promise<Stripe.UpcomingInvoice | null>;
export declare function verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event;
export declare function mapPriceToPlanTier(priceId: string): string;
export declare function mapPlanTierToPriceId(tier: string, interval?: 'monthly' | 'annual'): string;
export declare function reportUsage(params: {
    subscriptionItemId: string;
    quantity: number;
}): Promise<Stripe.UsageRecord>;
//# sourceMappingURL=stripe.d.ts.map
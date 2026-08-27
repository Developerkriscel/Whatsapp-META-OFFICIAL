/**
 * Stripe Webhook Handler - Full event processing
 */
import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
/**
 * Register Stripe webhook routes
 */
export declare function registerStripeWebhook(app: FastifyInstance): Promise<void>;
export declare function handleCheckoutCompleted(app: FastifyInstance, session: Stripe.Checkout.Session): Promise<void>;
export declare function handleSubscriptionUpsert(app: FastifyInstance, subscription: Stripe.Subscription): Promise<void>;
export declare function handleInvoicePaid(app: FastifyInstance, invoice: Stripe.Invoice): Promise<void>;
//# sourceMappingURL=stripe-webhook.d.ts.map
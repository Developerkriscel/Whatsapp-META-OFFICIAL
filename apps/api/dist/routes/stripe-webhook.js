/**
 * Stripe Webhook Handler - Full event processing
 */
import { verifyWebhookSignature, mapPriceToPlanTier } from '../services/stripe.js';
/**
 * Register Stripe webhook routes
 */
export async function registerStripeWebhook(app) {
    // IMPORTANT: This route needs raw body for signature verification
    // The fastify-raw-body plugin adds rawBody to routes matching the specified pattern
    app.post('/api/v1/stripe/webhook', async (request, reply) => {
        const signature = request.headers['stripe-signature'];
        const payload = request.rawBody || JSON.stringify(request.body);
        let event;
        try {
            event = verifyWebhookSignature(payload, signature);
        }
        catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return reply.status(400).send({
                success: false,
                error: { code: 'INVALID_SIGNATURE', message: err.message },
            });
        }
        console.log(`[Stripe Webhook] Event: ${event.type}`);
        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await handleCheckoutCompleted(app, event.data.object);
                    break;
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await handleSubscriptionUpsert(app, event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await handleSubscriptionDeleted(app, event.data.object);
                    break;
                case 'invoice.paid':
                    await handleInvoicePaid(app, event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await handleInvoicePaymentFailed(app, event.data.object);
                    break;
                case 'customer.created':
                case 'customer.updated':
                    await handleCustomerUpdated(app, event.data.object);
                    break;
                case 'payment_method.attached':
                case 'payment_method.detached':
                    console.log(`Payment method event: ${event.type}`);
                    break;
                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }
            return { received: true };
        }
        catch (err) {
            console.error('Error processing webhook:', err);
            return reply.status(500).send({
                success: false,
                error: { code: 'WEBHOOK_ERROR', message: err.message },
            });
        }
    });
}
// ============================================
// Event Handlers
// ============================================
export async function handleCheckoutCompleted(app, session) {
    const tenantId = session.metadata?.tenantId;
    if (!tenantId) {
        console.warn('Checkout completed without tenantId metadata');
        return;
    }
    // Get subscription
    if (session.subscription) {
        const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;
        // Update tenant with subscription info
        await app.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                stripeSubId: subscriptionId,
                stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
                status: 'ACTIVE',
                isOnTrial: false,
            },
        });
        console.log(`Tenant ${tenantId} subscribed: ${subscriptionId}`);
    }
}
export async function handleSubscriptionUpsert(app, subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
        console.warn('Subscription event without tenantId metadata');
        return;
    }
    // Determine plan tier from price
    const priceId = subscription.items.data[0]?.price.id;
    const planTier = mapPriceToPlanTier(priceId);
    // Get plan from database
    const plan = await app.prisma.plan.findUnique({
        where: { tier: planTier },
    });
    if (!plan) {
        console.error(`Plan not found for tier: ${planTier}`);
        return;
    }
    // Update tenant
    await app.prisma.tenant.update({
        where: { id: tenantId },
        data: {
            stripeSubId: subscription.id,
            stripeCustomerId: typeof subscription.customer === 'string'
                ? subscription.customer
                : subscription.customer.id,
            planId: plan.id,
            status: subscription.status === 'active' ? 'ACTIVE' :
                subscription.status === 'trialing' ? 'TRIAL' :
                    subscription.status === 'past_due' ? 'ACTIVE' :
                        subscription.status === 'canceled' ? 'CHURNED' : 'PENDING_SETUP',
            isOnTrial: subscription.status === 'trialing',
            trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
    });
    console.log(`Subscription updated for tenant ${tenantId}: ${subscription.status}`);
}
async function handleSubscriptionDeleted(app, subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
        return;
    }
    await app.prisma.tenant.update({
        where: { id: tenantId },
        data: {
            status: 'CHURNED',
            stripeSubId: null,
        },
    });
    console.log(`Subscription canceled for tenant ${tenantId}`);
}
export async function handleInvoicePaid(app, invoice) {
    const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId)
        return;
    const tenant = await app.prisma.tenant.findFirst({
        where: { stripeCustomerId: customerId },
    });
    if (!tenant)
        return;
    // Create or update invoice record
    await app.prisma.invoice.upsert({
        where: { number: invoice.number || `temp_${invoice.id}` },
        update: {
            status: 'paid',
            paidAt: new Date(),
        },
        create: {
            tenantId: tenant.id,
            stripeInvoiceId: invoice.id,
            number: invoice.number || `temp_${invoice.id}`,
            status: 'paid',
            amount: (invoice.amount_paid || 0) / 100,
            subtotal: (invoice.amount_paid || 0) / 100,
            netAmount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency,
            periodStart: new Date((invoice.period_start || 0) * 1000),
            periodEnd: new Date((invoice.period_end || 0) * 1000),
            paidAt: new Date(),
            lineItems: invoice.lines?.data,
        },
    });
    // Reactivate tenant if suspended
    if (tenant.status === 'SUSPENDED') {
        await app.prisma.tenant.update({
            where: { id: tenant.id },
            data: { status: 'ACTIVE' },
        });
    }
    console.log(`Invoice paid: ${invoice.id} for tenant ${tenant.id}`);
}
async function handleInvoicePaymentFailed(app, invoice) {
    const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId)
        return;
    const tenant = await app.prisma.tenant.findFirst({
        where: { stripeCustomerId: customerId },
    });
    if (!tenant)
        return;
    // Update invoice status
    await app.prisma.invoice.upsert({
        where: { number: invoice.number || `temp_${invoice.id}` },
        update: { status: 'failed' },
        create: {
            tenantId: tenant.id,
            stripeInvoiceId: invoice.id,
            number: invoice.number || `temp_${invoice.id}`,
            status: 'failed',
            amount: (invoice.amount_due || 0) / 100,
            subtotal: (invoice.amount_due || 0) / 100,
            netAmount: (invoice.amount_due || 0) / 100,
            currency: invoice.currency,
            periodStart: new Date((invoice.period_start || 0) * 1000),
            periodEnd: new Date((invoice.period_end || 0) * 1000),
        },
    });
    console.log(`Invoice payment failed: ${invoice.id} for tenant ${tenant.id}`);
}
async function handleCustomerUpdated(app, customer) {
    console.log(`Customer updated: ${customer.id} (${customer.email})`);
}
//# sourceMappingURL=stripe-webhook.js.map
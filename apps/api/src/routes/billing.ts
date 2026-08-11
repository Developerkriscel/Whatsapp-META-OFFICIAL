/**
 * Billing Routes - Stripe integration endpoints
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCheckoutSession,
  createCustomer,
  cancelSubscription,
  updateSubscription,
  createPortalSession,
  listInvoices,
  getUpcomingInvoice,
  mapPlanTierToPriceId,
  STRIPE_CONFIG,
} from '../services/stripe.js';

const createCheckoutSchema = z.object({
  planTier: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

const upgradeSchema = z.object({
  planTier: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

/**
 * Register billing routes
 */
export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  // ============================================
  // GET /billing - Get billing info
  // ============================================

  app.get('/billing', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: {
        plan: true,
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const upcomingInvoice = tenant.stripeCustomerId
      ? await getUpcomingInvoice(tenant.stripeCustomerId).catch(() => null)
      : null;

    return {
      success: true,
      data: {
        plan: tenant.plan,
        status: tenant.status,
        isOnTrial: tenant.isOnTrial,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.messageResetAt,
        usage: {
          contacts: { current: tenant.currentContacts, limit: tenant.plan?.maxContacts || 0 },
          messages: { current: tenant.currentMessages, limit: tenant.plan?.maxMessagesPerMonth || 0 },
        },
        stripeCustomerId: tenant.stripeCustomerId,
        subscriptionId: tenant.stripeSubId,
        isMockMode: STRIPE_CONFIG.isMockMode,
        upcomingInvoice: upcomingInvoice ? {
          amount: upcomingInvoice.amount_due,
          date: upcomingInvoice.period_end,
        } : null,
        recentInvoices: tenant.invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          amount: inv.amount.toString(),
          status: inv.status,
          date: inv.createdAt,
        })),
      },
    };
  });

  // ============================================
  // GET /billing/plans - Get all available plans
  // ============================================

  app.get('/billing/plans', async (request, reply) => {
    const plans = await app.prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      success: true,
      data: plans.map((plan) => ({
        ...plan,
        limits: {
          maxContacts: plan.maxContacts,
          maxMessagesPerMonth: plan.maxMessagesPerMonth,
          maxPhoneNumbers: plan.maxPhoneNumbers,
          maxTeamMembers: plan.maxTeamMembers,
          maxCampaigns: plan.maxCampaigns,
          maxSegments: plan.maxSegments,
          maxTemplates: plan.maxTemplates,
          maxAPIKeys: plan.maxAPIKeys,
          maxMessagesPerMinute: plan.maxMessagesPerMinute,
        },
        features: {
          chatbotBuilder: plan.hasChatbotBuilder,
          whatsappFlows: plan.hasWhatsAppFlows,
          apiAccess: plan.hasAPI,
          aiChatbot: plan.hasAIChatbot,
          customBranding: plan.hasCustomBranding,
          prioritySupport: plan.hasPrioritySupport,
          advancedAnalytics: plan.hasAdvancedAnalytics,
          whiteLabel: plan.hasWhiteLabel,
          dripCampaigns: plan.hasDripCampaigns,
          abTesting: plan.hasABTesting,
        },
        priceIds: {
          monthly: mapPlanTierToPriceId(plan.tier, 'monthly'),
          annual: mapPlanTierToPriceId(plan.tier, 'annual'),
        },
      })),
    };
  });

  // ============================================
  // POST /billing/checkout - Create checkout session
  // ============================================

  app.post('/billing/checkout', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = createCheckoutSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get or create Stripe customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await createCustomer({
        email: tenant.billingEmail || `${tenant.id}@whatsapp-saas.com`,
        name: tenant.name,
        tenantId: tenant.id,
      });
      customerId = customer.id;
      await app.prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Get price ID
    const priceId = mapPlanTierToPriceId(body.planTier, body.interval);
    if (!priceId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PRICE_NOT_FOUND', message: 'Price ID not configured for this plan' },
      });
    }

    // Create checkout session
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const session = await createCheckoutSession({
      customerId,
      priceId,
      tenantId: tenant.id,
      successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/billing/cancel`,
    });

    return {
      success: true,
      data: session,
    };
  });

  // ============================================
  // POST /billing/portal - Customer portal
  // ============================================

  app.post('/billing/portal', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
    });

    if (!tenant?.stripeCustomerId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_CUSTOMER', message: 'No Stripe customer found' },
      });
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const session = await createPortalSession({
      customerId: tenant.stripeCustomerId,
      returnUrl: `${baseUrl}/billing`,
    });

    return { success: true, data: session };
  });

  // ============================================
  // POST /billing/cancel - Cancel subscription
  // ============================================

  app.post('/billing/cancel', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    if (request.authUser.role !== 'OWNER') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only owner can cancel subscription' },
      });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
    });

    if (!tenant?.stripeSubId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription' },
      });
    }

    await cancelSubscription(tenant.stripeSubId);

    await app.prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'CHURNED' },
    });

    return {
      success: true,
      data: { message: 'Subscription will be canceled at period end' },
    };
  });

  // ============================================
  // POST /billing/upgrade - Change plan
  // ============================================

  app.post('/billing/upgrade', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = upgradeSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get new plan
    const newPlan = await app.prisma.plan.findUnique({
      where: { tier: body.planTier },
    });

    if (!newPlan) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PLAN_NOT_FOUND', message: 'Target plan not found' },
      });
    }

    // If has active subscription, update in Stripe
    if (tenant.stripeSubId) {
      const newPriceId = mapPlanTierToPriceId(body.planTier, body.interval);
      if (newPriceId) {
        await updateSubscription({
          subscriptionId: tenant.stripeSubId,
          newPriceId,
        });
      }
    }

    // Update tenant plan
    await app.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        planId: newPlan.id,
        status: 'ACTIVE',
      },
    });

    return {
      success: true,
      data: { message: `Plan updated to ${newPlan.name}`, plan: newPlan },
    };
  });

  // ============================================
  // POST /billing/downgrade - Downgrade plan
  // ============================================

  app.post('/billing/downgrade', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = upgradeSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const newPlan = await app.prisma.plan.findUnique({
      where: { tier: body.planTier },
    });

    if (!newPlan) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PLAN_NOT_FOUND', message: 'Target plan not found' },
      });
    }

    // Update subscription
    if (tenant.stripeSubId) {
      const newPriceId = mapPlanTierToPriceId(body.planTier, body.interval);
      if (newPriceId) {
        await updateSubscription({
          subscriptionId: tenant.stripeSubId,
          newPriceId,
        });
      }
    }

    await app.prisma.tenant.update({
      where: { id: tenant.id },
      data: { planId: newPlan.id },
    });

    return {
      success: true,
      data: { message: `Plan changed to ${newPlan.name}`, plan: newPlan },
    };
  });

  // ============================================
  // GET /billing/invoices - List invoices
  // ============================================

  app.get('/billing/invoices', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get from database
    const invoices = await app.prisma.invoice.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Optionally sync from Stripe
    if (tenant.stripeCustomerId && !STRIPE_CONFIG.isMockMode) {
      try {
        const stripeInvoices = await listInvoices(tenant.stripeCustomerId, 20);

        for (const stripeInv of stripeInvoices) {
          await app.prisma.invoice.upsert({
            where: { number: stripeInv.number || `temp_${stripeInv.id}` },
            update: { status: stripeInv.status || 'pending' },
            create: {
              tenantId: tenant.id,
              stripeInvoiceId: stripeInv.id,
              number: stripeInv.number || `temp_${stripeInv.id}`,
              status: stripeInv.status || 'pending',
              amount: (stripeInv.amount_due || 0) / 100,
              periodStart: new Date((stripeInv.period_start || 0) * 1000),
              periodEnd: new Date((stripeInv.period_end || 0) * 1000),
              paidAt: stripeInv.status === 'paid' ? new Date() : null,
            },
          });
        }
      } catch (err) {
        console.error('Failed to sync invoices from Stripe:', err);
      }
    }

    const refreshed = await app.prisma.invoice.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { success: true, data: refreshed };
  });

  // ============================================
  // GET /billing/success - Checkout success
  // ============================================

  app.get('/billing/success', async (request, reply) => {
    const { session_id } = request.query as { session_id?: string };

    if (!session_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_SESSION', message: 'Session ID required' },
      });
    }

    return {
      success: true,
      data: {
        sessionId: session_id,
        message: 'Checkout completed successfully',
      },
    };
  });

  // ============================================
  // GET /billing/usage - Detailed usage
  // ============================================

  app.get('/billing/usage', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get current usage
    const [contactCount, messageCount, campaignCount, templateCount] = await Promise.all([
      app.prisma.contact.count({ where: { tenantId: request.authUser.tenantId } }),
      app.prisma.message.count({
        where: {
          tenantId: request.authUser.tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          },
        },
      }),
      app.prisma.campaign.count({ where: { tenantId: request.authUser.tenantId } }),
      app.prisma.template.count({ where: { tenantId: request.authUser.tenantId } }),
    ]);

    // Calculate days left this month
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();

    return {
      success: true,
      data: {
        contacts: {
          current: contactCount,
          limit: tenant.plan?.maxContacts || 500,
        },
        messages: {
          current: messageCount,
          limit: tenant.plan?.maxMessagesPerMonth || 5000,
          daysLeft,
        },
        campaigns: {
          current: campaignCount,
          limit: tenant.plan?.maxCampaigns || 10,
        },
        templates: {
          current: templateCount,
          limit: tenant.plan?.maxTemplates || 10,
        },
      },
    };
  });

  // ============================================
  // GET /billing/proration - Preview plan change proration
  // ============================================

  app.get('/billing/proration', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { newPlan } = request.query as { newPlan?: string };
    if (!newPlan) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_PLAN' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: { plan: true },
    });

    if (!tenant || !tenant.plan) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const newPlanData = await app.prisma.plan.findFirst({
      where: { tier: newPlan as any, isPublic: true },
    });

    if (!newPlanData) {
      return reply.status(404).send({ success: false, error: { code: 'PLAN_NOT_FOUND' } });
    }

    // Calculate proration
    const currentPrice = Number(tenant.plan.monthlyPrice);
    const newPrice = Number(newPlanData.monthlyPrice);
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const daysRemaining = daysInMonth - dayOfMonth;

    // Credit for unused days on current plan
    const credit = (currentPrice / daysInMonth) * daysRemaining;
    // Charge for remaining days on new plan
    const charge = (newPrice / daysInMonth) * daysRemaining;
    const net = charge - credit;

    return {
      success: true,
      data: {
        credit: Math.round(credit * 100) / 100,
        charge: Math.round(charge * 100) / 100,
        net: Math.round(net * 100) / 100,
        effectiveDate: new Date().toISOString(),
        newPlanPrice: newPrice,
        currentPlanPrice: currentPrice,
      },
    };
  });

  // PATCH /billing/settings - Update billing settings
  app.patch('/billing/settings', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      billingEmail: z.string().email().optional(),
      billingAddress: z.string().optional(),
      billingName: z.string().optional(),
      taxId: z.string().optional(),
    });

    const body = schema.parse(request.body);

    const tenant = await app.prisma.tenant.update({
      where: { id: request.authUser.tenantId },
      data: body,
    });

    return { success: true, data: tenant };
  });

  // GET /billing/settings - Get billing settings
  app.get('/billing/settings', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      select: {
        billingEmail: true,
        billingAddress: true,
        billingName: true,
        taxId: true,
      },
    });

    return {
      success: true,
      data: {
        ...tenant,
        autoRechargeEnabled: false,
        autoRechargeThreshold: 1000,
        autoRechargeAmount: 5000,
        usageAlertEnabled: true,
        usageAlertContactsPercent: 80,
        usageAlertMessagesPercent: 80,
      }
    };
  });

  // GET /billing/invoices/:id - Get single invoice with details
  app.get('/billing/invoices/:invoiceId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { invoiceId } = z.object({ invoiceId: z.string() }).parse(request.params);

    const invoice = await app.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: request.authUser.tenantId },
    });

    if (!invoice) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return {
      success: true,
      data: {
        ...invoice,
        amount: Number(invoice.amount),
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.taxAmount),
        discount: Number(invoice.discount),
        netAmount: Number(invoice.netAmount),
      },
    };
  });

  // GET /billing/credits - Get credit balance and auto-recharge settings
  app.get('/billing/credits', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantCredit = await app.prisma.tenantCredit.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    const creditBalance = tenantCredit?.balance || 0;

    return {
      success: true,
      data: {
        balance: creditBalance,
        pricePerMessage: 0.0001,
        estimatedMessages: Math.floor(creditBalance / 0.0001),
        autoRecharge: {
          enabled: false,
          threshold: 1000,
          amount: 5000,
        },
      },
    };
  });

  // POST /billing/credits/purchase - Purchase credits
  app.post('/billing/credits/purchase', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      amount: z.number().min(1000),
    });

    const { amount } = schema.parse(request.body);
    const pricePerCredit = 0.0001;
    const totalCost = amount * pricePerCredit;

    return {
      success: true,
      data: {
        credits: amount,
        pricePerCredit,
        totalCost: Math.round(totalCost * 100) / 100,
      },
    };
  });
}
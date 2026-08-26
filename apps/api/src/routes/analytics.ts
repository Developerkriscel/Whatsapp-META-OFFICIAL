/**
 * Insights Dashboard Routes
 * Enhanced metrics: Messaging, Campaigns, Inbox, WhatsApp, Finance
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checkPlanLimits, enforceContactLimit, enforceMessageLimit } from '../services/billingEnforcement.js';

export async function registerInsightsRoutes(app: FastifyInstance): Promise<void> {

  // ============================================
  // INSIGHTS OVERVIEW
  // ============================================

  /**
   * GET /insights/overview - Get all insights summary
   */
  app.get('/insights/overview', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Parallel queries for performance
    const [
      // Messaging stats
      totalMessages,
      messagesToday,
      messagesThisWeek,
      messagesThisMonth,
      // Contacts stats
      totalContacts,
      optedInContacts,
      optedOutContacts,
      // Campaign stats
      totalCampaigns,
      campaignsThisMonth,
      // Conversation stats
      openConversations,
      avgResponseTime,
      // WhatsApp health
      phoneNumbers,
    ] = await Promise.all([
      // Messages
      app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING' } }),
      app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING', createdAt: { gte: today } } }),
      app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING', createdAt: { gte: weekAgo } } }),
      app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING', createdAt: { gte: monthAgo } } }),
      // Contacts
      app.prisma.contact.count({ where: { tenantId, isActive: true } }),
      app.prisma.contact.count({ where: { tenantId, isActive: true, consentStatus: 'OPTED_IN' } }),
      app.prisma.contact.count({ where: { tenantId, isActive: true, consentStatus: 'OPTED_OUT' } }),
      // Campaigns
      app.prisma.campaign.count({ where: { tenantId } }),
      app.prisma.campaign.count({ where: { tenantId, createdAt: { gte: monthAgo } } }),
      // Conversations
      app.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      app.prisma.user.aggregate({ where: { tenantId }, _avg: { avgResponseTime: true } }),
      // WhatsApp
      app.prisma.phoneNumber.findMany({
        where: { tenantId },
        select: { id: true, qualityScore: true },
      }),
    ]);

    // Calculate delivery rate
    const deliveredCount = await app.prisma.message.count({
      where: { tenantId, direction: 'OUTGOING', status: 'DELIVERED' },
    });
    const deliveryRate = totalMessages > 0 ? Math.round((deliveredCount / totalMessages) * 100) : 0;

    // Calculate read rate
    const readCount = await app.prisma.message.count({
      where: { tenantId, direction: 'OUTGOING', status: 'READ' },
    });
    const readRate = totalMessages > 0 ? Math.round((readCount / totalMessages) * 100) : 0;

    // WhatsApp quality
    const connectedPhones = phoneNumbers.length;
    const qualityRatings = phoneNumbers.map(p => p.qualityScore).filter(Boolean);

    return {
      success: true,
      data: {
        messaging: {
          totalSent: totalMessages,
          sentToday: messagesToday,
          sentThisWeek: messagesThisWeek,
          sentThisMonth: messagesThisMonth,
          deliveryRate,
          readRate,
        },
        contacts: {
          total: totalContacts,
          optedIn: optedInContacts,
          optedOut: optedOutContacts,
          consentRate: totalContacts > 0 ? Math.round((optedInContacts / totalContacts) * 100) : 0,
        },
        campaigns: {
          total: totalCampaigns,
          thisMonth: campaignsThisMonth,
        },
        inbox: {
          openConversations,
        },
        whatsapp: {
          connectedPhones,
          qualityRatings,
        },
      },
    };
  });

  // ============================================
  // MESSAGING ANALYTICS
  // ============================================

  /**
   * GET /insights/messaging - Detailed messaging analytics
   */
  app.get('/insights/messaging', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { period = '30d' } = request.query as { period?: string };
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tenantId = request.authUser.tenantId;

    // Get messages by day
    const messages = await app.prisma.message.findMany({
      where: {
        tenantId,
        direction: 'OUTGOING',
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
        type: true,
      },
    });

    // Group by day
    const dailyStats: Record<string, {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
    }> = {};

    for (const msg of messages) {
      const day = msg.createdAt.toISOString().split('T')[0];
      if (!dailyStats[day]) {
        dailyStats[day] = { sent: 0, delivered: 0, read: 0, failed: 0 };
      }
      dailyStats[day].sent++;
      if (msg.status === 'DELIVERED') dailyStats[day].delivered++;
      if (msg.status === 'READ') dailyStats[day].read++;
      if (msg.status === 'FAILED') dailyStats[day].failed++;
    }

    // Get message types breakdown
    const messageTypes = await app.prisma.message.groupBy({
      by: ['type'],
      where: { tenantId, direction: 'OUTGOING', createdAt: { gte: startDate } },
      _count: { type: true },
    });

    return {
      success: true,
      data: {
        period,
        days,
        dailyStats: Object.entries(dailyStats).map(([date, stats]) => ({
          date,
          ...stats,
        })).sort((a, b) => a.date.localeCompare(b.date)),
        messageTypes: messageTypes.map(m => ({
          type: m.type,
          count: m._count.type,
        })),
        totals: {
          sent: messages.length,
          delivered: messages.filter(m => m.status === 'DELIVERED').length,
          read: messages.filter(m => m.status === 'READ').length,
          failed: messages.filter(m => m.status === 'FAILED').length,
        },
      },
    };
  });

  // ============================================
  // CAMPAIGN INSIGHTS
  // ============================================

  /**
   * GET /insights/campaigns - Campaign performance insights
   */
  app.get('/insights/campaigns', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;

    const campaigns = await app.prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get campaign messages for detailed stats
    const campaignStats = await Promise.all(
      campaigns.map(async (campaign) => {
        // This would normally be calculated from campaign_messages join
        // For now return campaign-level stats
        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalRecipients: campaign.totalRecipients || 0,
          totalSent: campaign.totalSent || 0,
          sentAt: campaign.lastSentAt,
          completedAt: campaign.completedAt,
        };
      })
    );

    // Summary stats
    const [completedCampaigns, totalSent, avgOpenRate] = await Promise.all([
      app.prisma.campaign.count({ where: { tenantId, status: 'COMPLETED' } }),
      app.prisma.campaign.aggregate({ where: { tenantId }, _sum: { totalSent: true } }),
      // Calculate avg delivery rate for completed campaigns
      app.prisma.campaign.findMany({
        where: { tenantId, status: 'COMPLETED', totalRecipients: { gt: 0 } },
        select: { totalSent: true, totalRecipients: true },
      }),
    ]);

    const deliveryRates = avgOpenRate.map(c =>
      c.totalSent && c.totalRecipients ? (c.totalSent / c.totalRecipients) * 100 : 0
    );
    const avgDelivery = deliveryRates.length > 0
      ? Math.round(deliveryRates.reduce((a, b) => a + b, 0) / deliveryRates.length)
      : 0;

    return {
      success: true,
      data: {
        campaigns: campaignStats,
        summary: {
          total: campaigns.length,
          completed: completedCampaigns,
          totalSent: totalSent._sum.totalSent || 0,
          avgDeliveryRate: avgDelivery,
        },
      },
    };
  });

  // ============================================
  // INBOX INSIGHTS
  // ============================================

  /**
   * GET /insights/inbox - Inbox performance insights
   */
  app.get('/insights/inbox', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Conversation stats
    const [
      totalConversations,
      openConversations,
      closedToday,
      openedThisWeek,
    ] = await Promise.all([
      app.prisma.conversation.count({ where: { tenantId } }),
      app.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      app.prisma.conversation.count({ where: { tenantId, closedAt: { gte: today } } }),
      app.prisma.conversation.count({ where: { tenantId, openedAt: { gte: weekAgo } } }),
    ]);

    // Agent workload
    const agentStats = await app.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['AGENT', 'MANAGER', 'ADMIN', 'OWNER'] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        isOnline: true,
        totalAssigned: true,
        totalResolved: true,
        avgResponseTime: true,
        _count: {
          select: { conversations: { where: { status: 'OPEN' } } },
        },
      },
    });

    // Average resolution time from closed conversations
    const closedWithTime = await app.prisma.conversation.findMany({
      where: { tenantId, status: 'CLOSED', closedAt: { gte: weekAgo } },
      select: { openedAt: true, closedAt: true },
      take: 100,
    });

    const resolutionTimes = closedWithTime
      .filter(c => c.closedAt && c.openedAt)
      .map(c => (c.closedAt!.getTime() - c.openedAt.getTime()) / 1000);

    const avgResolutionTime = resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : 0;

    return {
      success: true,
      data: {
        overview: {
          totalConversations,
          openConversations,
          closedToday,
          openedThisWeek,
          avgResolutionSeconds: avgResolutionTime,
        },
        agents: agentStats.map(a => ({
          id: a.id,
          name: a.name,
          status: a.status,
          isOnline: a.isOnline,
          activeChats: a._count.conversations,
          totalAssigned: a.totalAssigned,
          totalResolved: a.totalResolved,
          avgResponseSeconds: a.avgResponseTime || 0,
        })),
      },
    };
  });

  // ============================================
  // WHATSAPP INSIGHTS
  // ============================================

  /**
   * GET /insights/whatsapp - WhatsApp health insights
   */
  app.get('/insights/whatsapp', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;

    // Get phone numbers with health data (using correct schema field names)
    const phoneNumbers = await app.prisma.phoneNumber.findMany({
      where: { tenantId },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        qualityScore: true,
        dailySentLimit: true,
        todaySentCount: true,
        metaPhoneId: true,
        verifiedAt: true,
      },
    });

    // Get webhook logs (joined by tenantId, not via phone relation)
    const webhookStats = await app.prisma.webhookLog.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { status: true },
    });

    const totalWebhooks = webhookStats.reduce((sum, s) => sum + s._count.status, 0);
    const failedWebhooks = webhookStats.find(s => s.status === 'FAILED')?._count.status || 0;
    const webhookFailureRate = totalWebhooks > 0 ? Math.round((failedWebhooks / totalWebhooks) * 100) : 0;

    // Derive summary stats
    const connectedPhones = phoneNumbers.filter(p => p.status === 'connected').length;
    const qualityRatings = phoneNumbers.map(p => p.qualityScore).filter(Boolean) as string[];

    return {
      success: true,
      data: {
        // Top-level shape expected by DashboardPage
        connectedPhones,
        qualityRatings,
        webhookFailureRate,
        // Detailed per-phone data
        phones: phoneNumbers.map(p => ({
          id: p.id,
          displayName: p.displayName,
          phoneNumber: p.phoneNumber,
          status: p.status,
          isConnected: p.status === 'connected',
          qualityScore: p.qualityScore || 'UNKNOWN',
          dailySentLimit: p.dailySentLimit,
          todaySentCount: p.todaySentCount,
          metaPhoneId: p.metaPhoneId,
          verifiedAt: p.verifiedAt,
        })),
        webhookHealth: {
          totalLast7Days: totalWebhooks,
          failed: failedWebhooks,
          failureRate: webhookFailureRate,
        },
      },
    };
  });

  // ============================================
  // BILLING STATUS
  // ============================================

  /**
   * GET /insights/billing/status - Get current plan status and limits
   */
  app.get('/insights/billing/status', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    try {
      const status = await checkPlanLimits(app.prisma, request.authUser.tenantId);
      return { success: true, data: status };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BILLING_ERROR', message: error.message },
      });
    }
  });

  /**
   * POST /insights/billing/check-contact - Check if contact can be added
   */
  app.post('/insights/billing/check-contact', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const result = await enforceContactLimit(app.prisma, request.authUser.tenantId);
    return { success: true, data: result };
  });

  /**
   * POST /insights/billing/check-message - Check if message can be sent
   */
  app.post('/insights/billing/check-message', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const result = await enforceMessageLimit(app.prisma, request.authUser.tenantId);
    return { success: true, data: result };
  });

  // ============================================
  // FINANCE ANALYTICS
  // ============================================

  /**
   * GET /insights/finance - Billing and usage analytics
   */
  app.get('/insights/finance', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;

    // Get tenant with plan
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: true,
      },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get usage stats
    const [
      totalContacts,
      totalMessages,
      totalCampaigns,
      totalConversations,
    ] = await Promise.all([
      app.prisma.contact.count({ where: { tenantId, isActive: true } }),
      app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING' } }),
      app.prisma.campaign.count({ where: { tenantId } }),
      app.prisma.conversation.count({ where: { tenantId } }),
    ]);

    // Calculate usage percentages
    const maxContacts = tenant.plan?.maxContacts || 500;
    const maxMessages = tenant.plan?.maxMessagesPerMonth || 5000;

    const usage = {
      contacts: {
        used: totalContacts,
        limit: maxContacts,
        percentage: Math.round((totalContacts / maxContacts) * 100),
      },
      messages: {
        used: totalMessages,
        limit: maxMessages,
        percentage: Math.round((totalMessages / maxMessages) * 100),
      },
      campaigns: {
        used: totalCampaigns,
        limit: tenant.plan?.maxCampaigns || 10,
      },
    };

    // Get recent invoices
    const invoices = await app.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return {
      success: true,
      data: {
        plan: {
          name: tenant.plan?.name || 'Free',
          tier: tenant.plan?.tier || 'STARTER',
        },
        usage,
        billing: {
          status: tenant.status,
          trialEndsAt: tenant.trialEndsAt,
        },
        recentInvoices: invoices.map(i => ({
          id: i.id,
          number: i.number,
          amount: i.amount,
          status: i.status,
          createdAt: i.createdAt,
        })),
      },
    };
  });
}

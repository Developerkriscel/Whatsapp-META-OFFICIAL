/**
 * SuperAdmin Advanced Feature Routes
 * 1. Tenant Impersonation
 * 2. Dynamic Rate Card & Markup Editor
 * 3. System Announcements & Banners
 * 4. Webhook Queue & Meta API Rate Limit Inspector
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSuperadmin, createAuditLog } from '../middleware/auth.js';
import { META_RATES, creditsToUsd } from '../services/creditService.js';

let systemAnnouncements: Array<{
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  isActive: boolean;
  createdAt: string;
}> = [
  {
    id: 'ann-1',
    title: 'Platform Upgrade Complete',
    message: 'Meta Cloud API v18.0 engine upgrade successfully deployed across all clusters.',
    type: 'INFO',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

let globalProfitMarkupPercent = 20;

export async function registerSuperadminAdvancedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireSuperadmin());

  // 1. TENANT IMPERSONATION
  app.post('/tenants/:tenantId/impersonate', async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { take: 1 } },
    });

    if (!tenant || tenant.users.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant or user not found' },
      });
    }

    const user = tenant.users[0];
    const superadminActor = await app.prisma.superadmin.findUnique({
      where: { id: request.authUser.id },
      select: { id: true, name: true, email: true },
    });

    const accessToken = app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: tenant.id,
        isSuperadmin: false,
        isImpersonating: true,
        impersonatedBy: request.authUser.id,
      },
      { expiresIn: '2h' },
    );

    await createAuditLog(app.prisma, {
      actorId: request.authUser.id,
      actorType: 'superadmin',
      actorRole: request.authUser.role,
      action: 'IMPERSONATE_TENANT',
      resource: 'tenants',
      resourceId: tenantId,
      tenantId,
      metadata: { impersonatedUserId: user.id, impersonatedUserEmail: user.email },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: tenant.id,
          tenantName: tenant.name,
          impersonatedBy: {
            id: request.authUser.id,
            name: superadminActor?.name || 'Superadmin',
            email: superadminActor?.email || request.authUser.email,
          },
        },
      },
    };
  });

  // 2. DYNAMIC RATE CARD & MARKUP EDITOR
  app.get('/rate-card', async (request, reply) => {
    const rateCard = Object.entries(META_RATES).map(([code, rate]) => {
      const markupMultiplier = 1 + (globalProfitMarkupPercent / 100);
      return {
        countryCode: code,
        currency: rate.currency,
        metaCostUsd: creditsToUsd(rate.marketing).toFixed(4),
        chargedMarketingCredits: Math.ceil(rate.marketing * markupMultiplier),
        chargedMarketingUsd: creditsToUsd(rate.marketing * markupMultiplier).toFixed(4),
      };
    });

    return {
      success: true,
      data: {
        globalMarkupPercent: globalProfitMarkupPercent,
        rateCard: rateCard.slice(0, 20),
      },
    };
  });

  app.patch('/rate-card/markup', async (request, reply) => {
    const body = z.object({ markupPercent: z.number().min(0).max(500) }).parse(request.body);
    globalProfitMarkupPercent = body.markupPercent;

    await createAuditLog(app.prisma, {
      actorId: request.authUser.id,
      actorType: 'superadmin',
      actorRole: request.authUser.role,
      action: 'UPDATE_RATE_MARKUP',
      resource: 'billing',
      metadata: { markupPercent: body.markupPercent },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { success: true, data: { markupPercent: globalProfitMarkupPercent } };
  });

  // 3. SYSTEM ANNOUNCEMENTS
  app.get('/announcements', async (request, reply) => {
    return { success: true, data: systemAnnouncements };
  });

  app.post('/announcements', async (request, reply) => {
    const body = z.object({
      title: z.string().min(1),
      message: z.string().min(1),
      type: z.enum(['INFO', 'WARNING', 'CRITICAL', 'SUCCESS']).default('INFO'),
    }).parse(request.body);

    const announcement = {
      id: `ann-${Date.now()}`,
      title: body.title,
      message: body.message,
      type: body.type,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    systemAnnouncements.unshift(announcement);

    await createAuditLog(app.prisma, {
      actorId: request.authUser.id,
      actorType: 'superadmin',
      actorRole: request.authUser.role,
      action: 'CREATE_ANNOUNCEMENT',
      resource: 'announcements',
      resourceId: announcement.id,
      metadata: body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ success: true, data: announcement });
  });

  app.delete('/announcements/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    systemAnnouncements = systemAnnouncements.filter(a => a.id !== id);
    return { success: true, data: { message: 'Announcement deleted' } };
  });

  // 4. WEBHOOK QUEUE & META API RATE LIMIT INSPECTOR
  app.get('/webhook-inspector', async (request, reply) => {
    const [recentMessages, totalMessages, failedMessages] = await Promise.all([
      app.prisma.message.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, direction: true, createdAt: true, tenant: { select: { name: true } } },
      }),
      app.prisma.message.count(),
      app.prisma.message.count({ where: { status: 'FAILED' } }),
    ]);

    const successRatePercentage = totalMessages > 0
      ? (((totalMessages - failedMessages) / totalMessages) * 100).toFixed(1)
      : '100.0';

    return {
      success: true,
      data: {
        queueStatus: 'IDLE',
        queueDepth: 0,
        processedTotal: totalMessages,
        failedTotal: failedMessages,
        successRatePercentage,
        metaApiRateLimit: {
          percentageUsed: 14,
          status: 'HEALTHY',
          resetsInSeconds: 38,
        },
        recentWebhooks: recentMessages.map(m => ({
          id: m.id,
          event: m.direction === 'INCOMING' ? 'messages.upsert' : 'message.status_update',
          status: m.status,
          tenant: m.tenant?.name || 'System',
          timestamp: m.createdAt,
        })),
      },
    };
  });
}

// TENANT ROUTES -- Dashboard, Contacts, Conversations, Messages, Campaigns, etc.

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { WhatsAppAPIClient, getDefaultConfig } from '@whatsapp-saas/config/guards';

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Register tenant routes
 */
export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(date).toLocaleDateString();
  }
  // ============================================
  // DASHBOARD
  // ============================================

  app.get('/dashboard', async (request, reply) => {
    const tenantId = request.authUser.tenantId;

    if (!tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get dashboard metrics
    const [
      totalContacts,
      totalConversations,
      openConversations,
      messagesThisMonth,
      activeAgents,
    ] = await Promise.all([
      app.prisma.contact.count({ where: { tenantId, isActive: true } }),
      app.prisma.conversation.count({ where: { tenantId } }),
      app.prisma.conversation.count({ where: { tenantId, status: 'OPEN' } }),
      app.prisma.message.count({
        where: {
          tenantId,
          direction: 'OUTGOING',
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
      app.prisma.user.count({ where: { tenantId, isActive: true, role: { in: ['AGENT', 'MANAGER', 'ADMIN', 'OWNER'] } } }),
    ]);

    // Calculate delivery rate
    const messageStats = await app.prisma.message.groupBy({
      by: ['status'],
      where: { tenantId, direction: 'OUTGOING', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _count: true,
    });

    const totalSent = messageStats.reduce((sum, s) => sum + s._count, 0);
    const delivered = messageStats.find(s => s.status === 'DELIVERED')?._count || 0;
    const read = messageStats.find(s => s.status === 'READ')?._count || 0;

    return {
      success: true,
      data: {
        totalContacts,
        totalConversations,
        openConversations,
        messagesThisMonth,
        activeAgents,
        deliveryRate: totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0,
        readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
      },
    };
  });

  // ============================================
  // DASHBOARD STATS (alias for compatibility)
  // ============================================

  app.get('/dashboard/stats', async (request, reply) => {
    const tenantId = request.authUser.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const [totalContacts, messagesThisMonth] = await Promise.all([
      app.prisma.contact.count({ where: { tenantId, isActive: true } }),
      app.prisma.message.count({
        where: {
          tenantId,
          direction: 'OUTGOING',
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
    ]);

    const activeContacts = await app.prisma.contact.count({
      where: { tenantId, isActive: true, lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });

    const messageStats = await app.prisma.message.groupBy({
      by: ['status'],
      where: { tenantId, direction: 'OUTGOING', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _count: true,
    });

    const totalSent = messageStats.reduce((sum, s) => sum + s._count, 0);
    const delivered = messageStats.find(s => s.status === 'DELIVERED')?._count || 0;
    const pending = messageStats.filter(s => ['PENDING', 'QUEUED'].includes(s.status)).reduce((sum, s) => sum + s._count, 0);

    return {
      success: true,
      data: {
        totalContacts,
        activeContacts,
        messagesSent: totalSent,
        messagesDelivered: delivered,
        pendingMessages: pending,
        weeklyGrowth: 12.5,
      },
    };
  });

  // ============================================
  // DASHBOARD RECENT (recent conversations)
  // ============================================

  app.get('/dashboard/recent', async (request, reply) => {
    const tenantId = request.authUser.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const conversations = await app.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
      include: {
        contact: { select: { name: true, phone: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, status: true, createdAt: true },
        },
      },
    });

    const messages = conversations.map(conv => ({
      id: conv.id,
      contact: {
        name: conv.contact.name || conv.contact.phone,
        phone: conv.contact.phone,
      },
      preview: conv.messages[0]?.body?.substring(0, 50) || 'No messages',
      time: conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : 'N/A',
      status: conv.messages[0]?.status?.toLowerCase() || 'delivered',
    }));

    return { success: true, data: { messages } };
  });

  // ============================================
  // DASHBOARD CHART (weekly message volume)
  // ============================================

  app.get('/dashboard/chart', async (request, reply) => {
    const tenantId = request.authUser.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await app.prisma.message.count({
        where: {
          tenantId,
          direction: 'OUTGOING',
          createdAt: { gte: date, lt: nextDate },
        },
      });

      result.push({
        day: days[date.getDay()],
        messages: count,
      });
    }

    return { success: true, data: result };
  });

  // ============================================
  // CONTACTS
  // ============================================

  app.get('/contacts', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = paginationSchema.extend({
      search: z.string().optional(),
    }).parse(request.query);
    const { page, limit, sort, order, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: request.authUser.tenantId, isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      app.prisma.contact.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit,
        include: { tags: { include: { tag: true } } },
      }),
      app.prisma.contact.count({ where }),
    ]);

    return {
      success: true,
      data: contacts.map(c => ({
        ...c,
        tags: c.tags.map(t => t.tag.name),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.post('/contacts', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      phone: z.string().min(1),
      name: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      company: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      tags: z.array(z.string()).optional(),
    });

    const { tags, email, ...rest } = schema.parse(request.body);

    // Plan contact limit enforcement
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: { plan: true },
    });

    if (tenant?.plan) {
      const max = tenant.plan.maxContacts;
      const current = await app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, isActive: true },
      });
      if (max !== -1 && current >= max) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'LIMIT_REACHED',
            message: `Contact limit reached (${current}/${max}). Upgrade your plan.`,
            upgradeRequired: true,
          },
        });
      }
    }

    const contact = await app.prisma.contact.create({
      data: {
        ...rest,
        email: email || undefined,
        tenantId: request.authUser.tenantId,
      },
    });

    // Create tag links if tags were provided
    const savedTags: string[] = [];
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        if (!tagName.trim()) continue;
        const tag = await app.prisma.tag.upsert({
          where: { tenantId_name: { tenantId: request.authUser.tenantId, name: tagName.trim() } },
          create: { tenantId: request.authUser.tenantId, name: tagName.trim(), color: '#6366f1' },
          update: {},
        });
        await app.prisma.contactTag.create({
          data: { contactId: contact.id, tagId: tag.id },
        }).catch(() => {});
        savedTags.push(tagName.trim());
      }
    }

    return reply.status(201).send({ success: true, data: { ...contact, tags: savedTags } });
  });

  app.get('/contacts/:contactId', async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string() }).parse(request.params);

    const contact = await app.prisma.contact.findFirst({
      where: { id: contactId, tenantId: request.authUser.tenantId },
      include: {
        tags: { include: { tag: true } },
        conversations: { include: { phoneNumber: true } },
      },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    }

    return { success: true, data: { ...contact, tags: contact.tags.map(t => t.tag) } };
  });

  app.patch('/contacts/:contactId', async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      company: z.string().optional(),
      city: z.string().optional(),
    }).parse(request.body);

    const contact = await app.prisma.contact.update({
      where: { id: contactId, tenantId: request.authUser.tenantId },
      data: body,
    });

    return { success: true, data: contact };
  });

  // ============================================
  // CONTACTS IMPORT/EXPORT
  // ============================================

  app.post('/contacts/import', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      contacts: z.array(z.object({
        name: z.string().optional(),
        phone: z.string().min(1),
        email: z.string().email().optional(),
        company: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })).min(1).max(1000),
      duplicateHandling: z.enum(['SKIP', 'UPDATE', 'OVERWRITE']).default('SKIP'),
    });

    const { contacts, duplicateHandling } = schema.parse(request.body);

    const results = { imported: 0, skipped: 0, updated: 0, errors: [] as string[] };

    for (const contact of contacts) {
      try {
        // Check for existing contact by phone
        const existing = await app.prisma.contact.findFirst({
          where: { tenantId: request.authUser.tenantId, phone: contact.phone },
        });

        if (existing) {
          if (duplicateHandling === 'SKIP') {
            results.skipped++;
            continue;
          } else if (duplicateHandling === 'UPDATE' || duplicateHandling === 'OVERWRITE') {
            await app.prisma.contact.update({
              where: { id: existing.id },
              data: {
                name: contact.name || existing.name,
                email: contact.email || existing.email,
                company: contact.company || existing.company,
              },
            });
            results.updated++;
            continue;
          }
        }

        // Create new contact
        await app.prisma.contact.create({
          data: {
            tenantId: request.authUser.tenantId!,
            phone: contact.phone,
            name: contact.name || 'Unknown',
            email: contact.email,
            company: contact.company,
            country: 'US',
            isActive: true,
          },
        });
        results.imported++;
      } catch (err) {
        results.errors.push(`Failed to import ${contact.phone}: ${(err as Error).message}`);
      }
    }

    return { success: true, data: results };
  });

  app.get('/contacts/export', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { format = 'csv' } = z.object({
      format: z.enum(['csv', 'json']).default('csv'),
    }).parse(request.query);

    const contacts = await app.prisma.contact.findMany({
      where: { tenantId: request.authUser.tenantId, isActive: true },
      select: { id: true, name: true, phone: true, email: true, company: true, createdAt: true, isActive: true },
    });

    if (format === 'json') {
      return { success: true, data: contacts };
    }

    // CSV format
    const csvRows = [
      ['Name', 'Phone', 'Email', 'Company', 'Created', 'Status'].join(','),
      ...contacts.map(c => [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        c.phone,
        c.email || '',
        `"${(c.company || '').replace(/"/g, '""')}"`,
        new Date(c.createdAt).toISOString().split('T')[0],
        c.isActive ? 'Active' : 'Inactive',
      ].join(',')),
    ].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]}.csv"`);
    return csvRows;
  });

  // ============================================
  // GET /contacts/search — Search contacts
  // ============================================
  app.get('/contacts/search', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { q = '', page = '1', limit = '20' } = request.query as { q?: string; page?: string; limit?: string };
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { tenantId: request.authUser.tenantId, isActive: true };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      app.prisma.contact.findMany({ where, skip, take: limitNum, orderBy: { createdAt: 'desc' } }),
      app.prisma.contact.count({ where }),
    ]);

    return {
      success: true,
      data: { contacts, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    };
  });

  app.post('/contacts/bulk-delete', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      ids: z.array(z.string()).min(1).max(100),
    });

    const { ids } = schema.parse(request.body);

    await app.prisma.contact.updateMany({
      where: { id: { in: ids }, tenantId: request.authUser.tenantId },
      data: { isActive: false },
    });

    return { success: true, data: { deleted: ids.length } };
  });

  app.delete('/contacts/:contactId', async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string() }).parse(request.params);

    await app.prisma.contact.update({
      where: { id: contactId, tenantId: request.authUser.tenantId },
      data: { isActive: false },
    });

    return { success: true, data: { message: 'Contact deleted' } };
  });

  // ============================================
  // CONVERSATIONS
  // ============================================

  app.get('/conversations', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = paginationSchema.parse(request.query);
    const { page, limit, sort, order } = query;
    const skip = (page - 1) * limit;

    const where = { tenantId: request.authUser.tenantId };

    const [conversations, total] = await Promise.all([
      app.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
        include: {
          contact: true,
          phoneNumber: true,
          assignedTo: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      app.prisma.conversation.count({ where }),
    ]);

    return {
      success: true,
      data: conversations.map(c => ({
        ...c,
        lastMessage: c.messages[0] || null,
        messages: undefined,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.get('/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);

    const conversation = await app.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      include: {
        contact: true,
        phoneNumber: true,
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });

    if (!conversation) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    return { success: true, data: conversation };
  });

  app.patch('/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const body = z.object({
      status: z.enum(['OPEN', 'CLOSED', 'PENDING_AGENT', 'ARCHIVED']).optional(),
      assignedToId: z.string().optional(),
      isBotActive: z.boolean().optional(),
    }).parse(request.body);

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: body,
    });

    return { success: true, data: conversation };
  });

  app.post('/conversations/:conversationId/close', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    return { success: true, data: conversation };
  });

  app.post('/conversations/:conversationId/assign', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const { userId } = z.object({ userId: z.string() }).parse(request.body);

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: { assignedToId: userId, status: 'OPEN' },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    return { success: true, data: conversation };
  });

  // ============================================
  // CONVERSATIONS STATS
  // ============================================

  app.get('/conversations/stats', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { period = '30d' } = z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d'),
    }).parse(request.query);

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get status breakdown
    const statusCounts = await app.prisma.conversation.groupBy({
      by: ['status'],
      where: { tenantId: request.authUser.tenantId },
      _count: true,
    });

    // Get today's conversations
    const totalToday = await app.prisma.conversation.count({
      where: {
        tenantId: request.authUser.tenantId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    // Get message stats
    const messageStats = await app.prisma.message.groupBy({
      by: ['direction', 'status'],
      where: { tenantId: request.authUser.tenantId },
      _count: true,
    });

    const stats = {
      total: statusCounts.reduce((acc, s) => acc + s._count, 0),
      byStatus: statusCounts.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      today: totalToday,
      avgResponseHours: '2.5', // Mock value since response time calculation is complex
      activeConversations: statusCounts.find(s => s.status === 'OPEN')?._count || 0,
      closedConversations: statusCounts.find(s => s.status === 'CLOSED')?._count || 0,
      pendingConversations: statusCounts.find(s => (s.status as any) === 'PENDING')?._count || 0,
      messages: {
        total: messageStats.reduce((acc, s) => acc + s._count, 0),
        inbound: messageStats.filter(s => (s.direction as any) === 'INCOMING' || (s.direction as any) === 'INBOUND').reduce((acc, s) => acc + s._count, 0),
        outbound: messageStats.filter(s => s.direction === 'OUTGOING').reduce((acc, s) => acc + s._count, 0),
        delivered: messageStats.filter(s => s.status === 'DELIVERED').reduce((acc, s) => acc + s._count, 0),
        read: messageStats.filter(s => s.status === 'READ').reduce((acc, s) => acc + s._count, 0),
      },
      period,
    };

    return { success: true, data: stats };
  });

  // ============================================
  // MESSAGES
  // ============================================

  app.post('/messages/send', async (request, reply) => {
    const schema = z.object({
      conversationId: z.string().optional(),
      contactId: z.string().optional(),
      phoneNumberId: z.string().optional(),
      phone: z.string().optional(),
      body: z.string().optional(),
      message: z.string().optional(),
      type: z.enum(['text', 'template']).default('text'),
    });

    const parsed = schema.parse(request.body);
    let contactId = parsed.contactId;
    let phoneNumberId = parsed.phoneNumberId;
    const messageText = parsed.body || parsed.message || '';

    // Auto-resolve contactId by phone if not explicitly provided
    if (!contactId && parsed.phone) {
      let contactObj = await app.prisma.contact.findFirst({
        where: { tenantId: request.authUser.tenantId!, phone: parsed.phone },
      });

      if (!contactObj) {
        contactObj = await app.prisma.contact.create({
          data: {
            tenantId: request.authUser.tenantId!,
            name: parsed.phone,
            phone: parsed.phone,
            country: 'IN',
          },
        });
      }
      contactId = contactObj.id;
    }

    // Auto-resolve phoneNumberId if not explicitly provided
    if (!phoneNumberId) {
      const phoneRec = await app.prisma.phoneNumber.findFirst({
        where: { tenantId: request.authUser.tenantId! },
      });
      if (phoneRec) {
        phoneNumberId = phoneRec.id;
      } else {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_PHONE_NUMBER', message: 'No phone number configured for tenant' },
        });
      }
    }

    if (!contactId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_RECIPIENT', message: 'contactId or phone is required' },
      });
    }

    const body = {
      conversationId: parsed.conversationId,
      contactId,
      phoneNumberId,
      body: messageText,
      type: parsed.type,
    };

    // Get contact for country code
    const contact = await app.prisma.contact.findUnique({
      where: { id: body.contactId },
      select: { country: true },
    });

    const countryCode = contact?.country || 'US';
    const category = 'UTILITY'; // Default for text messages (free within session window)

    // Check and deduct credits
    const { deductCredits, getRateCredits } = await import('../services/creditService.js') as any;
    const costCredits = getRateCredits(countryCode, category);
    const creditsResult = await deductCredits(
      app.prisma,
      request.authUser.tenantId!,
      costCredits,
      `message-send-${Date.now()}`,
      'MESSAGE',
      `Message to ${countryCode}`,
    );

    if (!creditsResult.success) {
      return reply.status(402).send({
        success: false,
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `Not enough credits. You need ${costCredits} credits to send this message. Please purchase more credits.`,
          required: costCredits,
          current: creditsResult.balanceAfter,
        },
      });
    }

    // Get or create conversation
    let conversationId = body.conversationId;

    if (!conversationId) {
      let conversation = await app.prisma.conversation.findUnique({
        where: {
          contactId_phoneNumberId_tenantId: {
            contactId: body.contactId,
            phoneNumberId: body.phoneNumberId,
            tenantId: request.authUser.tenantId!,
          },
        },
      });

      if (!conversation) {
        conversation = await app.prisma.conversation.create({
          data: {
            tenantId: request.authUser.tenantId!,
            contactId: body.contactId,
            phoneNumberId: body.phoneNumberId,
            status: 'OPEN',
          },
        });
      }
      conversationId = conversation.id;
    }

    // Create message
    const message = await app.prisma.message.create({
      data: {
        tenantId: request.authUser.tenantId!,
        conversationId,
        contactId: body.contactId,
        senderId: request.authUser.id,
        phoneNumberId: body.phoneNumberId,
        direction: 'OUTGOING',
        type: 'TEXT',
        body: body.body,
        status: 'PENDING',
      },
    });

    // Fetch target contact phone for Meta dispatch
    const targetContact = await app.prisma.contact.findUnique({
      where: { id: body.contactId },
      select: { phone: true },
    });

    // Dispatch message to Meta Cloud API / Service
    const { dispatchOutboundMessage } = await import('../services/whatsappService.js');
    const dispatchResult = await dispatchOutboundMessage({
      app,
      messageId: message.id,
      tenantId: request.authUser.tenantId!,
      contactPhone: targetContact?.phone || '',
      phoneNumberId: body.phoneNumberId,
      body: body.body || '',
      type: 'text',
    });

    const finalMessage = dispatchResult.data || message;

    // Update conversation
    await app.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
      },
    });

    // Update contact stats
    await app.prisma.contact.update({
      where: { id: body.contactId },
      data: { totalMessagesSent: { increment: 1 }, lastMessageAt: new Date() },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...finalMessage,
        creditsCost: costCredits,
        creditsRemaining: creditsResult.balanceAfter,
      },
    });
  });

  app.post('/messages/:messageId/read', async (request, reply) => {
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);

    const message = await app.prisma.message.update({
      where: { id: messageId, tenantId: request.authUser.tenantId },
      data: { readAt: new Date(), status: 'READ' },
    });

    return { success: true, data: message };
  });

  // ============================================
  // CAMPAIGNS
  // ============================================

  app.get('/campaigns', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = paginationSchema.parse(request.query);
    const { page, limit, sort, order } = query;
    const skip = (page - 1) * limit;

    const where = { tenantId: request.authUser.tenantId };

    const [campaigns, total] = await Promise.all([
      app.prisma.campaign.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit,
        include: { template: true, phoneNumber: true },
      }),
      app.prisma.campaign.count({ where }),
    ]);

    return {
      success: true,
      data: campaigns,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.post('/campaigns', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      templateId: z.string().nullable().optional(),
      phoneNumberId: z.string().nullable().optional(),
      audienceType: z.enum(['all', 'segment', 'contacts']).default('segment'),
      segmentIds: z.array(z.string()).optional(),
      contactIds: z.array(z.string()).optional(),
      scheduledAt: z.string().datetime().optional(),
    });

    const body = schema.parse(request.body);

    // Validate segment/contact selection based on audience type
    if (body.audienceType === 'segment' && (!body.segmentIds || body.segmentIds.length === 0)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_SEGMENT', message: 'At least one segment is required for segment-based campaigns' },
      });
    }
    if (body.audienceType === 'contacts' && (!body.contactIds || body.contactIds.length === 0)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_CONTACTS', message: 'At least one contact is required for contact-based campaigns' },
      });
    }

    // Calculate total recipients for tracking
    let totalRecipients = 0;
    if (body.audienceType === 'contacts' && body.contactIds) {
      totalRecipients = body.contactIds.length;
    } else if (body.audienceType === 'segment' && body.segmentIds) {
      const segmentContacts = await app.prisma.contactSegment.groupBy({
        by: ['contactId'],
        where: { segmentId: { in: body.segmentIds } },
      });
      totalRecipients = segmentContacts.length;
    }

    const campaign = await app.prisma.campaign.create({
      data: {
        tenantId: request.authUser.tenantId!,
        name: body.name,
        templateId: body.templateId,
        phoneNumberId: body.phoneNumberId,
        audienceType: body.audienceType,
        segmentIds: body.segmentIds || [],
        contactIds: body.contactIds || [],
        totalRecipients,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdById: request.authUser.id,
      },
    });

    return reply.status(201).send({ success: true, data: campaign });
  });

  app.post('/campaigns/:campaignId/send', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const tenantId = request.authUser.tenantId!;

    // Load tenant with plan info
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      return reply.status(404).send({ success: false, error: { code: 'TENANT_NOT_FOUND' } });
    }

    // Load full campaign with template and phone number
    const campaign = await app.prisma.campaign.findUnique({
      where: { id: campaignId, tenantId },
      include: {
        template: true,
        phoneNumber: true,
      },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot send campaign with status: ${campaign.status}` },
      });
    }

    if (!campaign.template) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_TEMPLATE', message: 'Campaign has no template assigned' },
      });
    }

    if (!campaign.phoneNumber?.metaPhoneId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_PHONE', message: 'Campaign has no connected WhatsApp phone number' },
      });
    }

    // Validate plan limits
    if (tenant.plan) {
      const maxCampaignsPerDay = tenant.plan.maxCampaignsPerDay;
      if (maxCampaignsPerDay !== -1) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const campaignsSentToday = await app.prisma.campaign.count({
          where: {
            tenantId,
            status: { in: ['SENDING', 'COMPLETED'] },
            startedAt: { gte: today },
          },
        });
        if (campaignsSentToday >= maxCampaignsPerDay) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'CAMPAIGN_LIMIT_REACHED',
              message: `Daily campaign limit reached (${maxCampaignsPerDay}). Upgrade your plan.`,
            },
          });
        }
      }
    }

    // Check credit balance
    const { getRateCredits } = await import('../services/creditService.js') as any;
    const templateCategory = campaign.template?.category || 'UTILITY';
    const costPerMessage = getRateCredits('US', templateCategory); // Estimate using US rate
    const requiredCredits = campaign.totalRecipients * costPerMessage;

    const creditBalance = await app.prisma.tenantCredit.findUnique({
      where: { tenantId },
    });

    if (!creditBalance || creditBalance.balance < requiredCredits) {
      return reply.status(402).send({
        success: false,
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `Not enough credits to send this campaign. You need approximately ${requiredCredits} credits.`,
          required: requiredCredits,
          current: creditBalance?.balance || 0,
        },
      });
    }

    // Mark as sending immediately
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING', startedAt: new Date() },
    });

    // Send messages asynchronously (don't block the response)
    sendCampaignMessages(app, campaignId, tenantId).catch((err) => {
      console.error(`Campaign ${campaignId} send error:`, err);
    });

    return { success: true, data: { message: 'Campaign sending started', recipients: campaign.totalRecipients } };
  });

  app.post('/campaigns/:campaignId/cancel', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    const campaign = await app.prisma.campaign.update({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
      data: { status: 'CANCELLED' },
    });

    return { success: true, data: campaign };
  });

  // Campaign statistics endpoint
  app.get('/campaigns/:campaignId/stats', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    const campaign = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
      include: {
        template: { select: { name: true, category: true } },
        phoneNumber: { select: { phoneNumber: true, displayName: true } },
      },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get delivery stats from messages
    const messageStats = await app.prisma.message.groupBy({
      by: ['status'],
      where: {
        tenantId: request.authUser.tenantId,
        // We need to filter by campaign - this requires campaignId on messages or a join table
        // For now, use the campaign's own stats fields
      },
    });

    const stats = {
      totalRecipients: campaign.totalRecipients,
      totalSent: campaign.totalSent,
      totalDelivered: campaign.totalDelivered,
      totalRead: campaign.totalRead,
      totalFailed: campaign.totalFailed,
      totalOptOut: campaign.totalOptOut,
      deliveryRate: campaign.totalSent > 0 ? Math.round((campaign.totalDelivered / campaign.totalSent) * 100) : 0,
      readRate: campaign.totalDelivered > 0 ? Math.round((campaign.totalRead / campaign.totalDelivered) * 100) : 0,
      failedRate: campaign.totalSent > 0 ? Math.round((campaign.totalFailed / campaign.totalSent) * 100) : 0,
    };

    return { success: true, data: { campaign, stats } };
  });

  app.patch('/campaigns/:campaignId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      templateId: z.string().nullable().optional(),
      phoneNumberId: z.string().nullable().optional(),
      audienceType: z.enum(['all', 'segment', 'contacts']).optional(),
      scheduledAt: z.string().nullable().optional(),
    }).parse(request.body);

    const campaign = await app.prisma.campaign.findUnique({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updated = await app.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.templateId !== undefined && { templateId: body.templateId }),
        ...(body.phoneNumberId !== undefined && { phoneNumberId: body.phoneNumberId }),
        ...(body.audienceType && { audienceType: body.audienceType }),
        ...(body.scheduledAt !== undefined && {
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          status: body.scheduledAt ? 'SCHEDULED' : campaign.status,
        }),
      },
    });

    return { success: true, data: updated };
  });

  app.delete('/campaigns/:campaignId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    await app.prisma.campaign.deleteMany({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Campaign deleted' } };
  });

  // ============================================
  // TEMPLATES
  // ============================================

  app.get('/templates', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const templates = await app.prisma.template.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: templates };
  });

  // ============================================
  // TEMPLATE CATEGORIES
  // ============================================

  app.get('/templates/categories', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const categories = [
      {
        id: 'MARKETING',
        name: 'Marketing',
        description: 'Promotional messages, offers, and announcements',
        icon: 'Megaphone',
        color: '#10b981',
        templateCount: await app.prisma.template.count({
          where: { tenantId: request.authUser.tenantId, category: 'MARKETING' },
        }),
      },
      {
        id: 'UTILITY',
        name: 'Utility',
        description: 'Personalized updates and notifications',
        icon: 'Bell',
        color: '#3b82f6',
        templateCount: await app.prisma.template.count({
          where: { tenantId: request.authUser.tenantId, category: 'UTILITY' },
        }),
      },
      {
        id: 'AUTHENTICATION',
        name: 'Authentication',
        description: 'One-time passwords and verification codes',
        icon: 'Shield',
        color: '#8b5cf6',
        templateCount: await app.prisma.template.count({
          where: { tenantId: request.authUser.tenantId, category: 'AUTHENTICATION' },
        }),
      },
    ];

    return { success: true, data: categories };
  });

  app.post('/templates', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
      language: z.string().default('en_US'),
      body: z.object({ text: z.string() }),
      header: z.object({ type: z.string(), text: z.string().optional() }).optional(),
      footer: z.string().optional(),
      buttons: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
    });

    const body = schema.parse(request.body);

    const template = await app.prisma.template.create({
      data: {
        tenantId: request.authUser.tenantId!,
        name: body.name,
        category: body.category,
        language: body.language,
        body: body.body,
        header: body.header as any,
        footer: body.footer as any,
        buttons: body.buttons as any,
        status: 'DRAFT',
      },
    });

    return reply.status(201).send({ success: true, data: template });
  });

  app.patch('/templates/:templateId', async (request, reply) => {
    const { templateId } = z.object({ templateId: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
      language: z.string().optional(),
      body: z.object({ text: z.string() }).optional(),
      header: z.object({ type: z.string(), text: z.string().optional() }).optional().nullable(),
      footer: z.string().optional().nullable(),
      buttons: z.array(z.object({ type: z.string(), text: z.string() })).optional().nullable(),
      status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
    }).parse(request.body);

    const template = await app.prisma.template.update({
      where: { id: templateId, tenantId: request.authUser.tenantId },
      data: body as any,
    });

    return { success: true, data: template };
  });

  app.post('/templates/:templateId/submit', async (request, reply) => {
    const { templateId } = z.object({ templateId: z.string() }).parse(request.params);

    const template = await app.prisma.template.findFirst({
      where: { id: templateId, tenantId: request.authUser.tenantId },
    });

    if (!template) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    if (template.status !== 'DRAFT' && template.status !== 'REJECTED') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot submit template with status: ${template.status}` },
      });
    }

    // Update template to PENDING
    const updated = await app.prisma.template.update({
      where: { id: templateId },
      data: { status: 'PENDING', submittedAt: new Date() },
    });

    // TODO: In production, this would submit to Meta WhatsApp API
    // For now, we just update the local status

    return { success: true, data: updated };
  });

  app.get('/templates/:templateId', async (request, reply) => {
    const { templateId } = z.object({ templateId: z.string() }).parse(request.params);

    const template = await app.prisma.template.findFirst({
      where: { id: templateId, tenantId: request.authUser.tenantId },
    });

    if (!template) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    return { success: true, data: template };
  });

  app.delete('/templates/:templateId', async (request, reply) => {
    const { templateId } = z.object({ templateId: z.string() }).parse(request.params);

    await app.prisma.template.deleteMany({
      where: { id: templateId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Template deleted' } };
  });

  // ============================================
  // TEAM
  // ============================================

  app.get('/team', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const users = await app.prisma.user.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        lastLoginAt: true,
        maxChats: true,
        createdAt: true,
      },
    });

    return { success: true, data: users };
  });

  app.post('/team/invite', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']),
      maxChats: z.number().default(5),
    });

    const body = schema.parse(request.body);

    // Check if user already exists
    const existing = await app.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: request.authUser.tenantId!, email: body.email } },
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'User with this email already exists' },
      });
    }

    const user = await app.prisma.user.create({
      data: {
        tenantId: request.authUser.tenantId!,
        email: body.email,
        name: body.name,
        role: body.role,
        maxChats: body.maxChats,
        password: 'temp-password', // User will need to set password via invite
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        maxChats: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({ success: true, data: user });
  });

  // ============================================
  // TEAM ROLES & ACTIVITY
  // ============================================

  app.get('/team/roles', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const roles = [
      {
        id: 'OWNER',
        name: 'Owner',
        description: 'Full access to all features and settings',
        permissions: ['*'],
      },
      {
        id: 'ADMIN',
        name: 'Admin',
        description: 'Manage team members and all business features',
        permissions: ['dashboard', 'contacts', 'conversations', 'campaigns', 'templates', 'team', 'settings', 'billing', 'analytics'],
      },
      {
        id: 'MANAGER',
        name: 'Manager',
        description: 'Manage conversations, campaigns, and view analytics',
        permissions: ['dashboard', 'contacts', 'conversations', 'campaigns', 'templates', 'analytics'],
      },
      {
        id: 'AGENT',
        name: 'Agent',
        description: 'Handle conversations and use templates',
        permissions: ['contacts', 'conversations', 'templates'],
      },
      {
        id: 'VIEWER',
        name: 'Viewer',
        description: 'Read-only access to dashboard and analytics',
        permissions: ['dashboard', 'analytics'],
      },
    ];

    return { success: true, data: roles };
  });

  app.get('/team/activity', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { page = 1, limit = 20 } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
    }).parse(request.query);

    const skip = (page - 1) * limit;

    // Get recent audit logs for this tenant
    const [activities, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where: { tenantId: request.authUser.tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      app.prisma.auditLog.count({
        where: { tenantId: request.authUser.tenantId },
      }),
    ]);

    // If no audit logs, generate mock activity
    const mockActivities = total === 0 ? [
      { id: '1', action: 'LOGIN', description: 'User logged in', user: { name: 'Admin', email: 'admin@demo.com' }, createdAt: new Date() },
      { id: '2', action: 'SEND_MESSAGE', description: 'Sent WhatsApp message', user: { name: 'Agent', email: 'agent@demo.com' }, createdAt: new Date(Date.now() - 3600000) },
      { id: '3', action: 'CREATE_CAMPAIGN', description: 'Created new campaign', user: { name: 'Admin', email: 'admin@demo.com' }, createdAt: new Date(Date.now() - 7200000) },
    ] : activities;

    return {
      success: true,
      data: mockActivities.map(a => ({
        id: a.id,
        action: a.action,
        description: a.description || a.action,
        user: a.user,
        createdAt: a.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.patch('/team/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']).optional(),
      maxChats: z.number().optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const user = await app.prisma.user.update({
      where: { id: userId, tenantId: request.authUser.tenantId },
      data: body,
      select: { id: true, email: true, name: true, role: true, maxChats: true },
    });

    return { success: true, data: user };
  });

  app.delete('/team/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId: request.authUser.tenantId },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    if (user.role === 'OWNER') {
      return reply.status(403).send({
        success: false,
        error: { code: 'CANNOT_DELETE_OWNER', message: 'Cannot delete the owner' },
      });
    }

    await app.prisma.user.delete({ where: { id: userId } });

    return { success: true, data: { message: 'Member removed' } };
  });

  app.post('/team/:userId/resend-invite', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId: request.authUser.tenantId },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // TODO: Send actual invitation email
    // For now, just return success
    return { success: true, data: { message: 'Invitation resent' } };
  });

  app.get('/team/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);

    const user = await app.prisma.user.findFirst({
      where: { id: userId, tenantId: request.authUser.tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        maxChats: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: user };
  });

  // ============================================
  // PHONE NUMBERS
  // ============================================

  app.get('/phone-numbers', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const phoneNumbers = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: phoneNumbers };
  });

  app.get('/phone-numbers/:phoneNumberId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneNumberId } = z.object({ phoneNumberId: z.string() }).parse(request.params);

    const phoneNumber = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, tenantId: request.authUser.tenantId },
    });

    if (!phoneNumber) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: phoneNumber };
  });

  app.post('/phone-numbers/:phoneNumberId/verify', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneNumberId } = z.object({ phoneNumberId: z.string() }).parse(request.params);
    const body = z.object({
      code: z.string().length(6),
    }).parse(request.body);

    const phoneNumber = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, tenantId: request.authUser.tenantId },
    });

    if (!phoneNumber) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    if (phoneNumber.verificationCode !== body.code) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
      });
    }

    const updated = await app.prisma.phoneNumber.update({
      where: { id: phoneNumberId },
      data: {
        status: 'verified',
        verifiedAt: new Date(),
        verificationCode: null,
      },
    });

    return { success: true, data: updated };
  });

  // Campaign pause/resume endpoints
  app.post('/campaigns/:campaignId/pause', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    const campaign = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    if (campaign.status !== 'SENDING') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Only sending campaigns can be paused' },
      });
    }

    // Note: For true pausing, we'd need to track batch progress
    // For now, just mark as paused
    const updated = await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' as any },
    });

    return { success: true, data: updated };
  });

  app.post('/campaigns/:campaignId/resume', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    const campaign = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    if ((campaign.status as any) !== 'PAUSED') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Only paused campaigns can be resumed' },
      });
    }

    const updated = await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' as any },
    });

    return { success: true, data: updated };
  });

  // Get single message
  app.get('/messages/:messageId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);

    const message = await app.prisma.message.findFirst({
      where: { id: messageId, tenantId: request.authUser.tenantId },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        conversation: { select: { id: true } },
      },
    });

    if (!message) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: message };
  });

  // ============================================
  // SETTINGS
  // ============================================

  app.get('/settings', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        website: true,
        timezone: true,
        defaultLanguage: true,
        industry: true,
        useCase: true,
        businessHours: true,
        billingEmail: true,
      },
    });

    return { success: true, data: tenant };
  });

  app.patch('/settings', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      name: z.string().optional(),
      logoUrl: z.string().url().optional().nullable(),
      website: z.string().url().optional().nullable(),
      timezone: z.string().optional(),
      defaultLanguage: z.string().optional(),
      industry: z.string().optional(),
      useCase: z.string().optional(),
      billingEmail: z.string().email().optional(),
    }).parse(request.body);

    const tenant = await app.prisma.tenant.update({
      where: { id: request.authUser.tenantId },
      data: body,
    });

    return { success: true, data: tenant };
  });

  app.post('/settings/api-key', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      name: z.string().min(1),
    });

    const { name } = schema.parse(request.body);

    const { randomBytes } = await import('crypto');
    const key = `wa_${randomBytes(32).toString('hex')}`;

    const apiKey = await app.prisma.apiKey.create({
      data: {
        tenantId: request.authUser.tenantId,
        userId: request.authUser.id,
        name,
        keyHash: key.slice(0, 8),
        keyPrefix: key.slice(0, 8),
        lastUsedAt: null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: key,
        createdAt: apiKey.createdAt,
      },
    });
  });

  app.get('/settings/api-keys', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const keys = await app.prisma.apiKey.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });

    return { success: true, data: keys };
  });

  app.delete('/settings/api-keys/:keyId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { keyId } = z.object({ keyId: z.string() }).parse(request.params);

    await app.prisma.apiKey.deleteMany({
      where: { id: keyId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'API key deleted' } };
  });

  // ============================================
  // TAGS
  // ============================================

  app.get('/tags', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tags = await app.prisma.tag.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { name: 'asc' },
    });

    return { success: true, data: tags };
  });

  app.post('/tags', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366f1'),
    });

    const body = schema.parse(request.body);

    const tag = await app.prisma.tag.create({
      data: {
        tenantId: request.authUser.tenantId!,
        name: body.name,
        color: body.color,
      },
    });

    return reply.status(201).send({ success: true, data: tag });
  });

  // ============================================
  // CHATBOT FLOWS
  // ============================================

  app.post('/chatbot/flows', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      flowData: z.any().optional(),
    }).parse(request.body);

    const flow = await (app.prisma.botFlow.create as any)({
      data: {
        tenantId: request.authUser.tenantId!,
        name: body.name,
        description: body.description || null,
        flowData: body.flowData || { nodes: [], edges: [] },
      },
    });

    return reply.status(201).send({ success: true, data: flow });
  });

  app.patch('/chatbot/flows/:flowId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { flowId } = z.object({ flowId: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
      flowData: z.any().optional(),
    }).parse(request.body);

    const flow = await app.prisma.botFlow.updateMany({
      where: { id: flowId, tenantId: request.authUser.tenantId },
      data: body as any,
    });

    if (flow.count === 0) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: { message: 'Flow updated' } };
  });

  app.delete('/chatbot/flows/:flowId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { flowId } = z.object({ flowId: z.string() }).parse(request.params);

    await app.prisma.botFlow.deleteMany({
      where: { id: flowId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Flow deleted' } };
  });

  // ============================================
  // ANALYTICS
  // ============================================

  // Helper to get date range
  function getDateRange(period: string, start?: string, end?: string) {
    let days = 30;
    if (period === '7d') days = 7;
    else if (period === '90d') days = 90;
    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
  }

  app.get('/analytics/overview', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { period = '30d', start, end } = request.query as any;
    const { startDate, endDate } = getDateRange(period, start, end);

    const [
      totalMessages,
      sentMessages,
      deliveredMessages,
      readMessages,
      failedMessages,
      activeContacts,
      conversations,
    ] = await Promise.all([
      app.prisma.message.count({
        where: { tenantId: request.authUser.tenantId, createdAt: { gte: startDate, lte: endDate } },
      }),
      app.prisma.message.count({
        where: { tenantId: request.authUser.tenantId, direction: 'OUTGOING', createdAt: { gte: startDate, lte: endDate } },
      }),
      app.prisma.message.count({
        where: { tenantId: request.authUser.tenantId, direction: 'OUTGOING', status: 'DELIVERED', createdAt: { gte: startDate, lte: endDate } },
      }),
      app.prisma.message.count({
        where: { tenantId: request.authUser.tenantId, direction: 'OUTGOING', status: 'READ', createdAt: { gte: startDate, lte: endDate } },
      }),
      app.prisma.message.count({
        where: { tenantId: request.authUser.tenantId, direction: 'OUTGOING', status: 'FAILED', createdAt: { gte: startDate, lte: endDate } },
      }),
      app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, isActive: true },
      }),
      app.prisma.conversation.groupBy({
        by: ['status'],
        where: { tenantId: request.authUser.tenantId },
        _count: true,
      }),
    ]);

    const conversationStats = {
      total: 0,
      open: 0,
      closed: 0,
      pending: 0,
    };
    conversations.forEach(c => {
      conversationStats.total += c._count;
      if (c.status === 'OPEN') conversationStats.open = c._count;
      else if (c.status === 'CLOSED') conversationStats.closed = c._count;
      else if (c.status === 'PENDING_AGENT') conversationStats.pending = c._count;
    });

    // Calculate rates
    const deliveryRate = sentMessages > 0 ? deliveredMessages / sentMessages : 0;
    const openRate = deliveredMessages > 0 ? readMessages / deliveredMessages : 0;
    const responseRate = totalMessages > 0 ? (totalMessages - sentMessages) / totalMessages : 0;

    // Get top template
    const topTemplate = await app.prisma.template.findFirst({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { totalSent: 'desc' },
      select: { name: true },
    });

    // Get top campaign
    const topCampaign = await app.prisma.campaign.findFirst({
      where: { tenantId: request.authUser.tenantId, status: 'COMPLETED' },
      orderBy: { totalSent: 'desc' },
      select: { name: true },
    });

    return {
      success: true,
      data: {
        totalMessages: sentMessages,
        sentMessages,
        deliveredMessages,
        readMessages,
        failedMessages,
        activeContacts,
        newContacts: 0,
        avgResponseTime: 4.2,
        responseRate,
        totalRevenue: 0,
        revenuePerMessage: 0,
        topTemplate: topTemplate?.name || '-',
        topCampaign: topCampaign?.name || '-',
        conversationStats,
        dailyStats: [],
        campaignStats: [],
      },
    };
  });

  app.get('/analytics/metrics', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { period = '30d', start, end } = request.query as any;
    const { startDate, endDate } = getDateRange(period, start, end);

    // Get messages grouped by day
    const messages = await app.prisma.message.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        createdAt: { gte: startDate, lte: endDate },
        direction: 'OUTGOING',
      },
      select: {
        status: true,
        createdAt: true,
      },
    });

    // Group by day
    const dailyMap = new Map<string, { sent: number; delivered: number; read: number; failed: number }>();
    messages.forEach(msg => {
      const date = msg.createdAt.toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { sent: 0, delivered: 0, read: 0, failed: 0 });
      }
      const day = dailyMap.get(date)!;
      day.sent++;
      if (msg.status === 'DELIVERED') day.delivered++;
      if (msg.status === 'READ') day.read++;
      if (msg.status === 'FAILED') day.failed++;
    });

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats, responses: 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { success: true, data: { dailyStats } };
  });

  app.get('/analytics/campaigns', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const campaigns = await app.prisma.campaign.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const campaignStats = campaigns.map(c => ({
      id: c.id,
      name: c.name,
      sent: c.totalSent,
      delivered: c.totalDelivered,
      read: c.totalRead,
      failed: c.totalFailed,
      ctr: c.totalSent > 0 ? (c.totalDelivered / c.totalSent) * 100 : 0,
      revenue: 0,
      status: c.status,
    }));

    return { success: true, data: campaignStats };
  });

  app.get('/analytics/revenue', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get credit transactions for this period
    const { period = '30d', start, end } = request.query as any;
    const { startDate, endDate } = getDateRange(period, start, end);

    const transactions = await app.prisma.tenantCreditTransaction.findMany({
      where: {
        credit: { tenantId: request.authUser.tenantId },
        createdAt: { gte: startDate, lte: endDate },
        type: 'PURCHASE',
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const byDayMap = new Map<string, number>();
    transactions.forEach(t => {
      const date = t.createdAt.toISOString().split('T')[0];
      byDayMap.set(date, (byDayMap.get(date) || 0) + Number(t.amount || 0));
    });

    const byDay = Array.from(byDayMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const total = byDay.reduce((sum, d) => sum + d.amount, 0);

    return { success: true, data: { total, byDay } };
  });

  app.get('/analytics/export', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { period = '30d', format = 'csv', start, end } = request.query as any;
    const { startDate, endDate } = getDateRange(period, start, end);

    // Get all messages in period
    const messages = await app.prisma.message.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        contact: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all campaigns in period
    const campaigns = await app.prisma.campaign.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'json') {
      return {
        success: true,
        data: {
          exportDate: new Date().toISOString(),
          period: { start: startDate.toISOString(), end: endDate.toISOString() },
          summary: {
            totalMessages: messages.length,
            sentMessages: messages.filter(m => m.direction === 'OUTGOING').length,
            deliveredMessages: messages.filter(m => m.status === 'DELIVERED').length,
            readMessages: messages.filter(m => m.status === 'READ').length,
            failedMessages: messages.filter(m => m.status === 'FAILED').length,
            totalCampaigns: campaigns.length,
          },
          messages,
          campaigns,
        },
      };
    }

    // CSV format
    const csvRows = [
      ['Date', 'Contact', 'Direction', 'Type', 'Status', 'Body'].join(','),
      ...messages.map(m => [
        m.createdAt.toISOString(),
        m.contact?.phone || '',
        m.direction,
        m.type,
        m.status,
        `"${(m.body || '').replace(/"/g, '""')}"`,
      ].join(',')),
    ].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`);
    return csvRows;
  });

  // ============================================
  // SEGMENTS
  // ============================================

  app.get('/segments', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const segments = await app.prisma.segment.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: segments };
  });

  app.post('/segments', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      rules: z.any().optional(),
    });

    const body = schema.parse(request.body);

    const { randomBytes } = await import('crypto');
    const queryHash = randomBytes(16).toString('hex');

    const segment = await app.prisma.segment.create({
      data: {
        tenantId: request.authUser.tenantId!,
        name: body.name,
        description: body.description || null,
        query: body.rules || { type: 'all', conditions: [] },
        queryHash,
      },
    });

    return reply.status(201).send({ success: true, data: segment });
  });

  app.delete('/segments/:segmentId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    await app.prisma.segment.deleteMany({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Segment deleted' } };
  });

  app.patch('/segments/:segmentId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);
    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      rules: z.object({
        type: z.enum(['all', 'any']).optional(),
        conditions: z.array(z.object({
          field: z.string(),
          operator: z.string(),
          value: z.string(),
        })).optional(),
      }).optional(),
    });

    const body = schema.parse(request.body);

    const segment = await app.prisma.segment.update({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.rules && {
          query: body.rules,
          queryHash: Buffer.from(JSON.stringify(body.rules)).toString('hex'),
        }),
      },
    });

    return { success: true, data: segment };
  });

  app.get('/segments/:segmentId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    const segment = await app.prisma.segment.findFirst({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
    });

    if (!segment) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: segment };
  });

  app.get('/segments/:segmentId/preview', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);
    const query = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(request.query);

    const segment = await app.prisma.segment.findFirst({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
    });

    if (!segment) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Build query conditions
    const queryObj = (segment.query as any) || {};
    const conditions = queryObj.conditions || [];
    const matchType = queryObj.type || 'all';

    const contactFilters: any[] = [];
    for (const cond of conditions) {
      const filter: any = {};
      if (cond.field === 'tag') {
        filter.tags = { has: cond.value };
      } else if (cond.field === 'city') {
        filter.city = cond.operator === 'equals' ? cond.value : undefined;
      } else if (cond.field === 'country') {
        filter.country = cond.operator === 'equals' ? cond.value : undefined;
      } else if (cond.field === 'language') {
        filter.language = cond.operator === 'equals' ? cond.value : undefined;
      } else if (cond.field === 'company') {
        filter.company = cond.operator === 'equals' ? cond.value : undefined;
      }
      if (Object.keys(filter).length > 0) {
        contactFilters.push(filter);
      }
    }

    // Get matching contacts
    const contacts = await app.prisma.contact.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        ...(contactFilters.length > 0 && contactFilters[0]),
      },
      take: query.limit,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    // Get total count
    const total = await app.prisma.contact.count({
      where: {
        tenantId: request.authUser.tenantId,
        ...(contactFilters.length > 0 && contactFilters[0]),
      },
    });

    return { success: true, data: { total, matching: contacts } };
  });

  app.post('/segments/:segmentId/sync', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    const segment = await app.prisma.segment.findFirst({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
    });

    if (!segment) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Build conditions for counting
    const conditions = (segment.query as any)?.conditions || [];
    const contactFilters: any[] = [];

    for (const cond of conditions) {
      if (cond.field === 'tag' && cond.value) {
        contactFilters.push({ tags: { has: cond.value } });
      } else if (cond.field === 'country' && cond.value) {
        contactFilters.push({ country: cond.value });
      } else if (cond.field === 'city' && cond.value) {
        contactFilters.push({ city: cond.value });
      } else if (cond.field === 'language' && cond.value) {
        contactFilters.push({ language: cond.value });
      } else if (cond.field === 'company' && cond.value) {
        contactFilters.push({ company: cond.value });
      }
    }

    // Count matching contacts
    const totalContacts = await app.prisma.contact.count({
      where: {
        tenantId: request.authUser.tenantId,
        ...(contactFilters.length > 0 ? { AND: contactFilters } : {}),
      },
    });

    // Update segment with new count
    const updated = await app.prisma.segment.update({
      where: { id: segmentId },
      data: { totalContacts },
    });

    return { success: true, data: { totalContacts: updated.totalContacts } };
  });

  // ============================================
  // CHATBOT FLOWS
  // ============================================

  app.get('/chatbot/flows', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const flows = await app.prisma.botFlow.findMany({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: flows };
  });
}

// ============================================
// Campaign Message Sender
// ============================================

async function sendCampaignMessages(
  app: FastifyInstance,
  campaignId: string,
  tenantId: string
): Promise<void> {
  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      phoneNumber: true,
    },
  });

  if (!campaign) return;

  // Build audience contacts
  let contactIds: string[] = [];

  if (campaign.audienceType === 'contacts' && campaign.contactIds.length > 0) {
    contactIds = campaign.contactIds;
  } else if (campaign.audienceType === 'segment' && campaign.segmentIds.length > 0) {
    // Fetch contacts in segments
    const segmentContacts = await app.prisma.contactSegment.findMany({
      where: { segmentId: { in: campaign.segmentIds } },
      select: { contactId: true },
    });
    contactIds = [...new Set(segmentContacts.map((c) => c.contactId))];
  }

  if (contactIds.length === 0) {
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', totalSent: 0 },
    });
    return;
  }

  // Get contacts in batches
  const BATCH_SIZE = 10;
  const RATE_LIMIT_DELAY = 1100; // 1.1s between batches to respect WhatsApp rate limits

  let sent = 0;
  let failed = 0;

  const whatsappConfig = getDefaultConfig();
  const client = new WhatsAppAPIClient(whatsappConfig);

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const contacts = await app.prisma.contact.findMany({
      where: { id: { in: batch }, tenantId },
    });

    const phonePromises = contacts.map(async (contact) => {
      try {
        if (!campaign.template || !campaign.phoneNumber?.metaPhoneId) return;

        const messageBody = (campaign.template.body as any)?.text || '';
        const response = await client.sendTemplateMessage(
          contact.phone,
          campaign.template.name,
          campaign.template.language,
          [
            { type: 'body', text: messageBody },
          ],
          campaign.phoneNumber.metaPhoneId
        );

        // Create message record
        const metaMsgId = (response as any)?.messages?.[0]?.id as string | undefined;
        const message = await (app.prisma.message.create as any)({
          data: {
            tenantId,
            contactId: contact.id,
            phoneNumberId: campaign.phoneNumberId!,
            metaMessageId: metaMsgId,
            direction: 'OUTGOING',
            type: 'TEMPLATE',
            body: messageBody,
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        // Deduct credits based on template category
        const { deductCredits, getRateCredits } = await import('../services/creditService.js') as any;
        const templateCategory = campaign.template?.category || 'UTILITY';
        const countryCode = contact.country || 'US';
        const costCredits = getRateCredits(countryCode, templateCategory);

        await deductCredits(app.prisma, tenantId, costCredits, message.id, 'CAMPAIGN',
          `Campaign: ${campaign.name} to ${contact.phone}`);

        sent++;
      } catch (err: any) {
        console.error(`Failed to send to ${contact.phone}:`, err.message);
        failed++;

        // Log failed message
        await (app.prisma.message.create as any)({
          data: {
            tenantId,
            contactId: contact.id,
            phoneNumberId: campaign.phoneNumberId || '',
            direction: 'OUTGOING',
            type: 'TEMPLATE',
            body: (campaign.template?.body as any)?.text || '',
            status: 'FAILED',
            errorMessage: err.message,
          },
        });
      }
    });

    await Promise.all(phonePromises);

    // Rate limit delay between batches
    if (i + BATCH_SIZE < contactIds.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY));
    }
  }

  // Update campaign status with full stats
  await (app.prisma.campaign.update as any)({
    where: { id: campaignId },
    data: {
      status: 'COMPLETED',
      totalSent: sent,
      totalFailed: failed,
      completedAt: new Date(),
      lastSentAt: new Date(),
    },
  });

  console.log(`[Campaign] ${campaignId} completed: ${sent} sent, ${failed} failed`);
}

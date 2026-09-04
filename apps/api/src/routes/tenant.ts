// TENANT ROUTES -- Dashboard, Contacts, Conversations, Messages, Campaigns, etc.

import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { syncTemplatesFromMeta, submitTemplateToMeta, fetchMetaTemplates, resolveEffectiveWabaId, uploadTemplateHeaderSample } from '../services/metaTemplate.js';
import { decryptSecret } from '../services/credentialEncryption.js';
import { detectCountryFromPhone } from '../services/phoneCountry.js';
import { checkTemplateContent, getAISuggestion } from '../services/aiAssist.js';

type SegmentCondition = { field: string; operator: string; value?: string };

/**
 * Confirms every id in `ids` belongs to `tenantId` for the given model.
 *
 * Scoping the record you fetch by id is not enough on its own: a foreign key
 * that arrives in a request *body* is just as much a handle on someone else's
 * row. A campaign, for instance, is created inside the caller's own tenant --
 * but nothing stopped it from carrying another tenant's phoneNumberId, and the
 * send path then dispatched from that tenant's WhatsApp number using their
 * access token. Every body-supplied FK goes through here first.
 */
async function assertTenantOwns(
  prisma: any,
  model: 'template' | 'phoneNumber' | 'contact' | 'segment' | 'user' | 'team',
  ids: Array<string | null | undefined>,
  tenantId: string
): Promise<boolean> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return true;
  const found = await prisma[model].count({ where: { id: { in: wanted }, tenantId } });
  return found === wanted.length;
}

/**
 * Turns a segment's saved conditions + match type into a live Prisma Contact where-clause.
 * Segments are evaluated live (not materialized) so campaigns always see current data
 * without requiring an explicit sync step first.
 */
function buildSegmentContactWhere(
  queryObj: { type?: string; conditions?: SegmentCondition[] } | null | undefined
): Prisma.ContactWhereInput {
  const conditions = queryObj?.conditions || [];
  const matchType = queryObj?.type === 'any' ? 'any' : 'all';

  const clauses: Prisma.ContactWhereInput[] = [];
  for (const cond of conditions) {
    const clause = buildSegmentCondition(cond);
    if (clause) clauses.push(clause);
  }

  if (clauses.length === 0) return {};
  return matchType === 'any' ? { OR: clauses } : { AND: clauses };
}

function buildSegmentCondition(cond: SegmentCondition): Prisma.ContactWhereInput | null {
  const { field, operator, value } = cond;

  if (field === 'tag') {
    if (!value) return null;
    return { tags: { some: { tag: { name: value } } } };
  }

  const stringFields = ['city', 'country', 'language', 'company'] as const;
  if ((stringFields as readonly string[]).includes(field)) {
    const f = field as typeof stringFields[number];
    switch (operator) {
      case 'equals': return value ? { [f]: { equals: value, mode: 'insensitive' } } : null;
      case 'not_equals': return value ? { [f]: { not: { equals: value, mode: 'insensitive' } } } : null;
      case 'contains': return value ? { [f]: { contains: value, mode: 'insensitive' } } : null;
      case 'not_contains': return value ? { NOT: { [f]: { contains: value, mode: 'insensitive' } } } : null;
      case 'starts_with': return value ? { [f]: { startsWith: value, mode: 'insensitive' } } : null;
      case 'ends_with': return value ? { [f]: { endsWith: value, mode: 'insensitive' } } : null;
      case 'is_empty': return { OR: [{ [f]: null }, { [f]: '' }] };
      case 'is_not_empty': return { AND: [{ [f]: { not: null } }, { [f]: { not: '' } }] };
      default: return null;
    }
  }

  if (field === 'totalMessagesSent') {
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    if (operator === 'greater_than') return { totalMessagesSent: { gt: num } };
    if (operator === 'less_than') return { totalMessagesSent: { lt: num } };
    if (operator === 'equals') return { totalMessagesSent: num };
    return null;
  }

  if (field === 'lastMessageAt' || field === 'createdAt') {
    if (operator === 'within_days') {
      const days = Number(value);
      if (Number.isNaN(days)) return null;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return { [field]: { gte: since } };
    }
    if (operator === 'is_empty') return { [field]: null };
    if (operator === 'is_not_empty') return { [field]: { not: null } };
    return null;
  }

  return null;
}

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** Columns the contact picker is allowed to sort by. Free-text sort would let a
 *  caller order by any column Prisma knows about, including ones we do not
 *  expose. */
const CONTACT_SORT_FIELDS = ['name', 'phone', 'country', 'consentStatus', 'createdAt', 'company', 'email'] as const;

const contactFilterSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(CONTACT_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  consentStatus: z.enum(['OPTED_IN', 'OPTED_OUT', 'UNKNOWN']).optional(),
  country: z.string().optional(),
  tag: z.string().optional(),
});

type ContactFilter = z.infer<typeof contactFilterSchema>;

/**
 * The one place contact filtering is defined.
 *
 * The picker's table and its "select everything that matches" action have to
 * agree exactly. If they each built their own where-clause, a filter handled by
 * one and not the other would silently select a different set of people than
 * the table is showing -- and the user would only find out after the campaign
 * had gone out.
 */
function buildContactWhere(tenantId: string, f: Partial<ContactFilter>): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId, isActive: true };

  if (f.search) {
    where.OR = [
      { name: { contains: f.search, mode: 'insensitive' } },
      { phone: { contains: f.search, mode: 'insensitive' } },
      { email: { contains: f.search, mode: 'insensitive' } },
      { company: { contains: f.search, mode: 'insensitive' } },
    ];
  }
  if (f.consentStatus) where.consentStatus = f.consentStatus;
  if (f.country) where.country = f.country;
  if (f.tag) where.tags = { some: { tag: { name: f.tag } } };

  return where;
}

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

  /**
   * Normalize phone number for consistent storage and comparison
   * - Removes spaces, dashes, parentheses
   * - Ensures E.164 format with leading +
   */
  function normalizePhone(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Ensure leading + for E.164 format
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    return normalized;
  }
  // ============================================
  // DASHBOARD
  // ============================================

  // Main dashboard overview endpoint (alias)
  app.get('/dashboard/overview', async (request, reply) => {
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

  // Alias /dashboard to /dashboard/overview
  app.get('/dashboard', async (request, reply) => {
    // Redirect to the overview handler
    const tenantId = request.authUser.tenantId;

    if (!tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

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

    const query = contactFilterSchema.parse(request.query);
    const { page, limit, sort, order } = query;
    const skip = (page - 1) * limit;

    const where = buildContactWhere(request.authUser.tenantId, query);

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

  /**
   * GET /contacts/select-ids — resolve a filter into an ordered list of ids.
   *
   * The picker shows one page at a time, but "select all 370 matching" and
   * "select the first 250" need the ids the user cannot see. Returning ids only
   * keeps that cheap: the full rows stay paginated.
   *
   * Order matters here. "First 250" means first in the order on screen, so this
   * takes the same sort the table is using.
   */
  app.get('/contacts/select-ids', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = contactFilterSchema.extend({
      // How many ids to return. Distinct from the table's page size.
      take: z.coerce.number().min(1).max(20000).optional(),
    }).parse(request.query);

    const where = buildContactWhere(request.authUser.tenantId, query);

    const [ids, total] = await Promise.all([
      app.prisma.contact.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        take: query.take ?? 20000,
        select: { id: true },
      }),
      app.prisma.contact.count({ where }),
    ]);

    return {
      success: true,
      data: {
        ids: ids.map((c) => c.id),
        returned: ids.length,
        total,
        // True when the cap cut the list short, so the UI can say so rather
        // than quietly selecting fewer people than the user asked for.
        truncated: ids.length < total,
      },
    };
  });

  /**
   * GET /contacts/filter-options — the distinct values worth filtering on.
   * Populates the picker's country and tag dropdowns with what this tenant
   * actually has, rather than a hardcoded list.
   */
  app.get('/contacts/filter-options', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const tenantId = request.authUser.tenantId;

    const [countries, tags, consent] = await Promise.all([
      app.prisma.contact.groupBy({
        by: ['country'],
        where: { tenantId, isActive: true },
        _count: { country: true },
        orderBy: { _count: { country: 'desc' } },
      }),
      app.prisma.tag.findMany({
        where: { tenantId },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      app.prisma.contact.groupBy({
        by: ['consentStatus'],
        where: { tenantId, isActive: true },
        _count: { consentStatus: true },
      }),
    ]);

    return {
      success: true,
      data: {
        countries: countries
          .filter((c) => c.country)
          .map((c) => ({ value: c.country, count: c._count.country })),
        tags: tags.map((t) => t.name),
        consentStatus: consent.map((c) => ({ value: c.consentStatus, count: c._count.consentStatus })),
      },
    };
  });

  app.post('/contacts', { preHandler: [app.requirePermission('contacts', 'create')] }, async (request, reply) => {
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

    // Normalize phone number: remove spaces, dashes, parentheses
    const normalizedPhone = normalizePhone(rest.phone);

    // Check for existing contact by normalized phone (tenant-scoped)
    const existingContact = await app.prisma.contact.findFirst({
      where: {
        tenantId: request.authUser.tenantId,
        phone: normalizedPhone,
      },
    });

    if (existingContact) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_CONTACT',
          message: 'A contact with this phone number already exists',
          existingContactId: existingContact.id,
          existingContactName: existingContact.name || 'Unknown',
        },
      });
    }

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

    // An explicit country wins; otherwise derive it from the number. Leaving it
    // undefined fell through to the schema default of 'IN', so a US contact
    // added by hand was billed at Indian rates.
    const contactTenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      select: { defaultCountry: true },
    });

    const contact = await app.prisma.contact.create({
      data: {
        phone: normalizedPhone,
        name: rest.name,
        email: email || undefined,
        company: rest.company,
        city: rest.city,
        country: rest.country || detectCountryFromPhone(normalizedPhone, contactTenant?.defaultCountry || 'IN'),
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

  app.patch('/contacts/:contactId', { preHandler: [app.requirePermission('contacts', 'update')] }, async (request, reply) => {
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

  app.post('/contacts/import', { preHandler: [app.requirePermission('contacts', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      contacts: z.array(z.object({
        name: z.string().optional(),
        // A blank cell arrives as "", which z.string().email() rejects — that
        // failed the whole import over an empty optional column.
        phone: z.string().min(1),
        email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
        company: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })).min(1).max(20000),
      duplicateHandling: z.enum(['SKIP', 'UPDATE', 'OVERWRITE']).default('SKIP'),
    });

    const { contacts, duplicateHandling } = schema.parse(request.body);
    const tenantId = request.authUser.tenantId!;

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultCountry: true },
    });

    // Country drives the per-message rate, so getting it wrong changes what the
    // tenant is charged. This was hardcoded to 'US': an Indian list imported
    // that way billed at US marketing rates, more than double the correct one.
    const countryFor = (phone: string) =>
      detectCountryFromPhone(phone, tenant?.defaultCountry || 'IN');

    const results = { created: 0, skipped: 0, updated: 0, errors: [] as string[] };

    // One lookup for the whole import instead of a query per row — a 400-row
    // file previously issued 400 sequential selects before writing anything.
    const phones = contacts.map((c) => c.phone);
    const existing = await app.prisma.contact.findMany({
      where: { tenantId, phone: { in: phones } },
      select: { id: true, phone: true, name: true, email: true, company: true },
    });
    const existingByPhone = new Map(existing.map((e) => [e.phone, e]));

    // Duplicates inside the file itself would otherwise race each other and
    // create the same contact twice.
    const seenInFile = new Set<string>();
    const toCreate: any[] = [];

    for (const contact of contacts) {
      const prior = existingByPhone.get(contact.phone);

      if (prior) {
        if (duplicateHandling === 'SKIP') {
          results.skipped++;
          continue;
        }
        try {
          await app.prisma.contact.update({
            where: { id: prior.id },
            data: {
              name: contact.name || prior.name,
              email: contact.email || prior.email,
              company: contact.company || prior.company,
            },
          });
          results.updated++;
        } catch (err) {
          results.errors.push(`Could not update ${contact.phone}: ${(err as Error).message}`);
        }
        continue;
      }

      if (seenInFile.has(contact.phone)) {
        results.skipped++;
        continue;
      }
      seenInFile.add(contact.phone);

      toCreate.push({
        tenantId,
        phone: contact.phone,
        name: contact.name || 'Unknown',
        email: contact.email,
        company: contact.company,
        country: countryFor(contact.phone),
        isActive: true,
        consentStatus: 'UNKNOWN', // Imported contacts need explicit consent
        consentSource: 'import',
      });
    }

    // Written in chunks so one very large file doesn't build a single oversized
    // statement, and so a failure loses one chunk rather than the whole import.
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const slice = toCreate.slice(i, i + CHUNK);
      try {
        const res = await app.prisma.contact.createMany({ data: slice, skipDuplicates: true });
        results.created += res.count;
        results.skipped += slice.length - res.count;
      } catch (err) {
        results.errors.push(`Could not import ${slice.length} contact(s): ${(err as Error).message}`);
      }
    }

    return { success: true, data: results };
  });

  app.get('/contacts/export', { preHandler: [app.requirePermission('contacts', 'export')] }, async (request, reply) => {
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
  // CONTACT CONSENT MANAGEMENT
  // ============================================

  /**
   * GET /contacts/consent-stats - Get consent statistics
   */
  app.get('/contacts/consent-stats', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const [optedIn, optedOut, unknown] = await Promise.all([
      app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, consentStatus: 'OPTED_IN' },
      }),
      app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, consentStatus: 'OPTED_OUT' },
      }),
      app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, consentStatus: 'UNKNOWN' },
      }),
    ]);

    return {
      success: true,
      data: {
        optedIn,
        optedOut,
        unknown,
        total: optedIn + optedOut + unknown,
        consentRate: optedIn + optedOut > 0
          ? Math.round((optedIn / (optedIn + optedOut + unknown)) * 100)
          : 0,
      },
    };
  });

  /**
   * POST /contacts/:contactId/opt-in - Opt contact in for marketing
   */
  app.post('/contacts/:contactId/opt-in', { preHandler: [app.requirePermission('contacts', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { contactId } = z.object({ contactId: z.string() }).parse(request.params);

    const contact = await app.prisma.contact.findFirst({
      where: { id: contactId, tenantId: request.authUser.tenantId },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updated = await app.prisma.contact.update({
      where: { id: contactId },
      data: {
        consentStatus: 'OPTED_IN',
        optInAt: new Date(),
        blocked: false,
        consentSource: 'manual',
        consentIp: request.ip,
        consentReference: `agent:${request.authUser.id}`,
      },
    });

    return { success: true, data: updated };
  });

  /**
   * POST /contacts/:contactId/opt-out - Opt contact out (STOP)
   */
  app.post('/contacts/:contactId/opt-out', { preHandler: [app.requirePermission('contacts', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { contactId } = z.object({ contactId: z.string() }).parse(request.params);

    const contact = await app.prisma.contact.findFirst({
      where: { id: contactId, tenantId: request.authUser.tenantId },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updated = await app.prisma.contact.update({
      where: { id: contactId },
      data: {
        consentStatus: 'OPTED_OUT',
        optOutAt: new Date(),
        blocked: true,
        consentSource: contact.consentSource || 'manual',
        consentIp: request.ip,
        consentReference: `agent:${request.authUser.id}`,
      },
    });

    // Create notification
    await app.prisma.notification.create({
      data: {
        tenantId: request.authUser.tenantId!,
        type: 'CONTACT_OPT_OUT',
        title: 'Contact Opted Out',
        message: `${contact.name || contact.phone} has opted out from marketing messages`,
        priority: 'NORMAL',
      },
    });

    return { success: true, data: updated };
  });

  /**
   * POST /contacts/bulk-opt-in - Bulk opt-in contacts
   */
  app.post('/contacts/bulk-opt-in', { preHandler: [app.requirePermission('contacts', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      contactIds: z.array(z.string()).min(1).max(1000),
    });

    const { contactIds } = schema.parse(request.body);

    const result = await app.prisma.contact.updateMany({
      where: {
        id: { in: contactIds },
        tenantId: request.authUser.tenantId,
        consentStatus: { not: 'OPTED_IN' },
      },
      data: {
        consentStatus: 'OPTED_IN',
        optInAt: new Date(),
        blocked: false,
        consentSource: 'bulk_import',
      },
    });

    return { success: true, data: { updated: result.count } };
  });

  /**
   * POST /contacts/bulk-opt-out - Bulk opt-out contacts
   */
  app.post('/contacts/bulk-opt-out', { preHandler: [app.requirePermission('contacts', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      contactIds: z.array(z.string()).min(1).max(1000),
    });

    const { contactIds } = schema.parse(request.body);

    const result = await app.prisma.contact.updateMany({
      where: {
        id: { in: contactIds },
        tenantId: request.authUser.tenantId,
        consentStatus: { not: 'OPTED_OUT' },
      },
      data: {
        consentStatus: 'OPTED_OUT',
        optOutAt: new Date(),
        blocked: true,
        consentSource: 'bulk_import',
      },
    });

    return { success: true, data: { updated: result.count } };
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

  app.post('/contacts/bulk-delete', { preHandler: [app.requirePermission('contacts', 'delete')] }, async (request, reply) => {
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

  app.delete('/contacts/:contactId', { preHandler: [app.requirePermission('contacts', 'delete')] }, async (request, reply) => {
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

    const query = paginationSchema.extend({
      filter: z.enum(['all', 'open', 'closed', 'pending', 'mine', 'bot']).optional(),
      search: z.string().optional(),
    }).parse(request.query);
    const { page, limit, sort, order, filter, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: request.authUser.tenantId };

    if (filter === 'open') {
      where.status = 'OPEN';
    } else if (filter === 'closed') {
      where.status = 'CLOSED';
    } else if (filter === 'pending') {
      where.status = { in: ['PENDING_AGENT'] };
    } else if (filter === 'mine') {
      where.assignedToId = request.authUser.id;
    } else if (filter === 'bot') {
      where.isBotActive = true;
    }

    if (search) {
      where.contact = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

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
          assignedTeam: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
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
        assignedTeam: { select: { id: true, name: true } },
        notes: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
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

  app.get('/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);

    const conversation = await app.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });

    if (!conversation) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    return { success: true, data: conversation.messages };
  });

  app.patch('/conversations/:conversationId', { preHandler: [app.requirePermission('conversations', 'update')] }, async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const body = z.object({
      status: z.string().optional(),
      assignedToId: z.string().optional(),
      isBotActive: z.boolean().optional(),
    }).parse(request.body);

    if (!(await assertTenantOwns(app.prisma, 'user', [body.assignedToId], request.authUser.tenantId!))) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignee not found' },
      });
    }

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: body as Prisma.ConversationUncheckedUpdateInput,
    });

    return { success: true, data: conversation };
  });

  app.post('/conversations/:conversationId/close', { preHandler: [app.requirePermission('conversations', 'update')] }, async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    return { success: true, data: conversation };
  });

  app.post('/conversations/:conversationId/assign', { preHandler: [app.requirePermission('conversations', 'update')] }, async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const { userId, teamId } = z.object({
      userId: z.string().optional(),
      teamId: z.string().optional(),
    }).parse(request.body);

    // An assignee from another tenant would surface that person's name through
    // the assignedTo/assignedTeam includes below.
    const ownsAssignees = await Promise.all([
      assertTenantOwns(app.prisma, 'user', [userId], request.authUser.tenantId!),
      assertTenantOwns(app.prisma, 'team', [teamId], request.authUser.tenantId!),
    ]);
    if (ownsAssignees.some((ok) => !ok)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignee not found' },
      });
    }

    const updateData: any = { status: 'OPEN' };
    if (userId) updateData.assignedToId = userId;
    if (teamId) updateData.assignedTeamId = teamId;

    const conversation = await app.prisma.conversation.update({
      where: { id: conversationId, tenantId: request.authUser.tenantId },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedTeam: { select: { id: true, name: true } },
      },
    });

    return { success: true, data: conversation };
  });

  app.post('/conversations/:conversationId/notes', { preHandler: [app.requirePermission('conversations', 'update')] }, async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);
    const { content } = z.object({ content: z.string().min(1).max(5000) }).parse(request.body);

    const note = await app.prisma.conversationNote.create({
      data: {
        tenantId: request.authUser.tenantId!,
        conversationId,
        authorId: request.authUser.id,
        content,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    return reply.status(201).send({ success: true, data: note });
  });

  app.get('/conversations/:conversationId/notes', async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string() }).parse(request.params);

    const notes = await app.prisma.conversationNote.findMany({
      where: { conversationId, tenantId: request.authUser.tenantId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, data: notes };
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

  app.post('/messages/send', { preHandler: [app.requirePermission('messages', 'send')] }, async (request, reply) => {
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
            // Was hardcoded 'IN', which billed every non-Indian recipient at
            // Indian rates regardless of where they actually are.
            country: detectCountryFromPhone(parsed.phone, 'IN'),
          },
        });
      }
      contactId = contactObj.id;
    }

    // Auto-resolve phoneNumberId if not explicitly provided — only safe when
    // the tenant has exactly one connected number. Silently picking one out
    // of several (arbitrary Prisma row order) risks sending from the wrong
    // number/WABA with no indication anything went wrong.
    if (!phoneNumberId) {
      const phoneRecs = await app.prisma.phoneNumber.findMany({
        where: { tenantId: request.authUser.tenantId! },
        take: 2,
      });
      if (phoneRecs.length === 1) {
        phoneNumberId = phoneRecs[0].id;
      } else if (phoneRecs.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_PHONE_NUMBER', message: 'No phone number configured for tenant' },
        });
      } else {
        return reply.status(400).send({
          success: false,
          error: { code: 'PHONE_AMBIGUOUS', message: 'Multiple phone numbers are connected — specify which one to send from' },
        });
      }
    }

    if (!contactId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_RECIPIENT', message: 'contactId or phone is required' },
      });
    }

    // Verify the contact belongs to this tenant (contactId/conversationId are client-supplied)
    const contact = await app.prisma.contact.findFirst({
      where: { id: contactId, tenantId: request.authUser.tenantId! },
      select: { id: true, country: true },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: { code: 'CONTACT_NOT_FOUND' } });
    }

    // Verify the phone number belongs to this tenant
    const phoneOwned = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, tenantId: request.authUser.tenantId! },
      select: { id: true },
    });

    if (!phoneOwned) {
      return reply.status(404).send({ success: false, error: { code: 'PHONE_NOT_FOUND' } });
    }

    // If a conversationId was supplied by the client, verify it belongs to this tenant too
    if (parsed.conversationId) {
      const conversationOwned = await app.prisma.conversation.findFirst({
        where: { id: parsed.conversationId, tenantId: request.authUser.tenantId! },
        select: { id: true },
      });
      if (!conversationOwned) {
        return reply.status(404).send({ success: false, error: { code: 'CONVERSATION_NOT_FOUND' } });
      }
    }

    const body = {
      conversationId: parsed.conversationId,
      contactId,
      phoneNumberId,
      body: messageText,
      type: parsed.type,
    };

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

  app.post('/messages/:messageId/read', { preHandler: [app.requirePermission('messages', 'update')] }, async (request, reply) => {
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

  /**
   * GET /campaigns/:campaignId - Get single campaign
   */
  app.get('/campaigns/:campaignId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    const campaign = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
      include: {
        template: true,
        phoneNumber: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    }

    return { success: true, data: campaign };
  });

  /**
   * GET /campaigns/:campaignId/messages - Per-recipient send results for a
   * campaign (contact, delivery status, timestamps, real Meta error if any).
   */
  app.get('/campaigns/:campaignId/messages', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { page, limit } = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);

    const campaign = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
      select: { id: true },
    });
    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    }

    const [messages, total] = await Promise.all([
      app.prisma.message.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { contact: { select: { id: true, name: true, phone: true } } },
      }),
      app.prisma.message.count({ where: { campaignId } }),
    ]);

    return {
      success: true,
      data: messages.map((m) => ({
        id: m.id,
        contact: m.contact,
        status: m.status,
        body: m.body,
        metaMessageId: m.metaMessageId,
        errorCode: m.errorCode,
        errorMessage: m.errorMessage,
        sentAt: m.sentAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        failedAt: m.failedAt,
        createdAt: m.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  /**
   * POST /campaigns/message-suggest - Optional Mistral-powered campaign copy
   * suggestion. AI-only (no rule engine) since free-text campaign messages
   * aren't submitted through Meta's template review. data: null if AI isn't
   * configured or the call fails.
   */
  app.post('/campaigns/message-suggest', { preHandler: [app.requirePermission('campaigns', 'create')] }, async (request, reply) => {
    const body = z.object({
      goal: z.string().optional(),
      audienceDescription: z.string().optional(),
      existingText: z.string().optional(),
    }).parse(request.body);

    const result = await getAISuggestion({ module: 'campaign', context: body });
    return { success: true, data: result };
  });

  /**
   * GET /campaigns/tier-capacity — how many more unique people this number may
   * message in the current rolling 24 hours.
   *
   * Until now this only surfaced as a 429 *after* the user had built the whole
   * campaign and pressed send. The picker needs it up front so "select the
   * first N" can mean the number Meta will actually accept.
   *
   * phoneNumberId is optional: early in the wizard no number has been chosen
   * yet, and if the tenant has exactly one there is nothing to choose.
   */
  app.get('/campaigns/tier-capacity', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    const tenantId = request.authUser.tenantId;
    const { phoneNumberId } = z.object({ phoneNumberId: z.string().optional() }).parse(request.query ?? {});

    let phone = null;
    if (phoneNumberId) {
      phone = await app.prisma.phoneNumber.findFirst({
        where: { id: phoneNumberId, tenantId },
        select: { id: true },
      });
      if (!phone) {
        return reply.status(404).send({ success: false, error: { code: 'PHONE_NOT_FOUND' } });
      }
    } else {
      const phones = await app.prisma.phoneNumber.findMany({
        where: { tenantId },
        select: { id: true },
        take: 2,
      });
      // Only auto-pick when there is no ambiguity. Guessing between several
      // numbers would report headroom for one and send from another.
      if (phones.length === 1) phone = phones[0];
    }

    if (!phone) {
      return {
        success: true,
        data: { known: false, reason: phoneNumberId ? 'NOT_FOUND' : 'PHONE_NOT_SELECTED' },
      };
    }

    const { getTierUsage } = await import('../services/sendQuota.js');
    const usage = await getTierUsage(app.prisma, phone.id);

    return {
      success: true,
      data: {
        known: true,
        phoneNumberId: phone.id,
        tier: usage.tier,
        limit: usage.limit,
        uniqueCustomers24h: usage.uniqueCustomers24h,
        remaining: usage.remaining,
      },
    };
  });

  app.post('/campaigns', { preHandler: [app.requirePermission('campaigns', 'create')] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      templateId: z.string().nullable().optional(),
      phoneNumberId: z.string().nullable().optional(),
      audienceType: z.enum(['all', 'segment', 'contacts']).default('segment'),
      segmentIds: z.array(z.string()).optional(),
      contactIds: z.array(z.string()).optional(),
      scheduledAt: z.string().datetime().nullable().optional(),
      mediaUrl: z.string().url().nullable().optional(),
      mediaPath: z.string().nullable().optional(),
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

    // Every id here arrived from the client, so each one is checked against the
    // caller's tenant before it is stored. A campaign row that references
    // another tenant's phone number or template would otherwise send from their
    // WhatsApp number, on their quality rating, with their access token.
    const ownsRefs = await Promise.all([
      assertTenantOwns(app.prisma, 'template', [body.templateId], request.authUser.tenantId!),
      assertTenantOwns(app.prisma, 'phoneNumber', [body.phoneNumberId], request.authUser.tenantId!),
      assertTenantOwns(app.prisma, 'segment', body.segmentIds || [], request.authUser.tenantId!),
      assertTenantOwns(app.prisma, 'contact', body.contactIds || [], request.authUser.tenantId!),
    ]);
    if (ownsRefs.some((ok) => !ok)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'One or more selected items could not be found' },
      });
    }

    // Calculate total recipients for tracking
    let totalRecipients = 0;
    if (body.audienceType === 'contacts' && body.contactIds) {
      totalRecipients = body.contactIds.length;
    } else if (body.audienceType === 'segment' && body.segmentIds) {
      const segments = await app.prisma.segment.findMany({
        where: { id: { in: body.segmentIds }, tenantId: request.authUser.tenantId },
      });
      const segmentWhere: Prisma.ContactWhereInput = {
        OR: segments.map(s => buildSegmentContactWhere(s.query as any)),
      };
      totalRecipients = await app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, ...segmentWhere },
      });
    } else if (body.audienceType === 'all') {
      // Count all active contacts for 'all' audience type
      totalRecipients = await app.prisma.contact.count({
        where: { tenantId: request.authUser.tenantId, isActive: true },
      });
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
        mediaUrl: body.mediaUrl ?? null,
        mediaPath: body.mediaPath ?? null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdById: request.authUser.id,
      },
    });

    return reply.status(201).send({ success: true, data: campaign });
  });

  app.post('/campaigns/:campaignId/send', { preHandler: [app.requirePermission('campaigns', 'send')] }, async (request, reply) => {
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

    // Media can only ride on a template whose approved definition has a header
    // to put it in. Attaching an image to a body-only template makes the send
    // loop add a header parameter, and Meta rejects every single recipient with
    // "(#132018) ... header: Template does not contain title component, no
    // parameters allowed". That is how a 248-recipient campaign failed 248
    // times for one reason nobody could see. Refuse up front instead.
    if (campaign.mediaUrl && !campaign.template.header) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TEMPLATE_HAS_NO_HEADER',
          message: `The template "${campaign.template.name}" has no image or video header, so the attached media cannot be sent with it. Remove the media, or use a template that was approved with a media header.`,
        },
      });
    }

    // Meta rejects every send attempt against a template that isn't APPROVED
    // yet (PENDING/REJECTED/DRAFT) — without this check the campaign used to
    // launch anyway, mark itself SENDING, then fail every single recipient
    // one-by-one with an opaque Meta error (#132001 "template name does not
    // exist in the translation"), burning the whole batch for one root cause.
    // Meta auto-provisions a handful of sample templates (hello_world, and
    // the jaspers_market_* demo set) on every WABA's sandbox test number.
    // They show up as APPROVED and look perfectly usable, but Meta hard-locks
    // them to the test number — sending from a real connected business phone
    // number always fails with #131058 "can only be sent from the Public
    // Test Numbers", for every recipient, no matter what else is correct.
    const META_SAMPLE_TEMPLATES = new Set([
      'hello_world',
      'jaspers_market_image_cta_v1',
      'jaspers_market_media_carousel_v1',
      'jaspers_market_order_confirmation_v1',
      'jaspers_market_plain_text_v1',
    ]);
    if (META_SAMPLE_TEMPLATES.has(campaign.template.name)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'SAMPLE_TEMPLATE_NOT_USABLE',
          message: `"${campaign.template.name}" is one of Meta's built-in sample templates — it only works from Meta's sandbox test number and will always fail from your real business number. Create and submit your own template for this campaign instead.`,
        },
      });
    }

    if (campaign.template.status !== 'APPROVED') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_APPROVED',
          message:
            campaign.template.status === 'REJECTED'
              ? `Template "${campaign.template.name}" was rejected by Meta${campaign.template.rejectionReason ? ` (${campaign.template.rejectionReason})` : ''}. Fix and resubmit it before sending this campaign.`
              : `Template "${campaign.template.name}" is still ${campaign.template.status.toLowerCase()} with Meta — it must be APPROVED before a campaign can send it.`,
          templateStatus: campaign.template.status,
        },
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

    // Meta caps how many unique customers a number may message per rolling 24h
    // (its messaging tier). Checking here means an oversized campaign is refused
    // up front, instead of sending until the cap is hit and then collecting
    // rejections for every remaining recipient — which is what used to happen.
    // `force: true` lets the caller send anyway and fill the remaining headroom.
    const { force } = z.object({ force: z.boolean().optional() }).parse(request.body ?? {});
    const { checkTierCapacity } = await import('../services/sendQuota.js');
    const tierCheck = await checkTierCapacity(
      app.prisma,
      campaign.phoneNumberId!,
      campaign.totalRecipients,
    );

    if (!tierCheck.withinTier && !force) {
      return reply.status(429).send({
        success: false,
        error: {
          code: 'MESSAGING_TIER_EXCEEDED',
          message: tierCheck.message,
          tier: tierCheck.usage.tier,
          limit: tierCheck.usage.limit,
          alreadyMessaged24h: tierCheck.usage.uniqueCustomers24h,
          remaining: tierCheck.usage.remaining,
          recipients: campaign.totalRecipients,
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

  app.post('/campaigns/:campaignId/cancel', { preHandler: [app.requirePermission('campaigns', 'update')] }, async (request, reply) => {
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

  app.patch('/campaigns/:campaignId', { preHandler: [app.requirePermission('campaigns', 'update')] }, async (request, reply) => {
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
      mediaUrl: z.string().url().nullable().optional(),
      mediaPath: z.string().nullable().optional(),
    }).parse(request.body);

    const campaign = await app.prisma.campaign.findUnique({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    if (!campaign) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Same rule as create: owning the campaign does not entitle you to point it
    // at another tenant's template or phone number.
    const patchOwnsRefs = await Promise.all([
      assertTenantOwns(app.prisma, 'template', [body.templateId], request.authUser.tenantId),
      assertTenantOwns(app.prisma, 'phoneNumber', [body.phoneNumberId], request.authUser.tenantId),
    ]);
    if (patchOwnsRefs.some((ok) => !ok)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'One or more selected items could not be found' },
      });
    }

    const updated = await app.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.templateId !== undefined && { templateId: body.templateId }),
        ...(body.phoneNumberId !== undefined && { phoneNumberId: body.phoneNumberId }),
        ...(body.audienceType && { audienceType: body.audienceType }),
        ...(body.mediaUrl !== undefined && { mediaUrl: body.mediaUrl }),
        ...(body.mediaPath !== undefined && { mediaPath: body.mediaPath }),
        ...(body.scheduledAt !== undefined && {
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          status: body.scheduledAt ? 'SCHEDULED' : campaign.status,
        }),
      },
    });

    return { success: true, data: updated };
  });

  app.delete('/campaigns/:campaignId', { preHandler: [app.requirePermission('campaigns', 'delete')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);

    // Read the media path before the row goes away, otherwise the uploaded file
    // is orphaned on disk with nothing left pointing at it.
    const existing = await app.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
      select: { mediaPath: true },
    });

    await app.prisma.campaign.deleteMany({
      where: { id: campaignId, tenantId: request.authUser.tenantId },
    });

    if (existing?.mediaPath) {
      const { deleteCampaignMedia } = await import('./uploads.js');
      await deleteCampaignMedia(existing.mediaPath);
    }

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

  /**
   * POST /templates/analyze - Live rule-based compliance check while creating a
   * template. Synchronous, no network call, safe to call on every debounced
   * keystroke. This is the same check enforced server-side at submit time.
   */
  app.post('/templates/analyze', { preHandler: [app.requirePermission('templates', 'create')] }, async (request, reply) => {
    const body = z.object({
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
      bodyText: z.string(),
      headerText: z.string().optional(),
      footerText: z.string().optional(),
      buttons: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
    }).parse(request.body);

    const result = checkTemplateContent(body);
    return { success: true, data: result };
  });

  /**
   * POST /templates/ai-rewrite - Optional Mistral-powered rewrite targeting the
   * compliance issues found by /templates/analyze. Returns data: null when no
   * MISTRAL_API_KEY is configured, or when the AI call fails for any reason.
   */
  app.post('/templates/ai-rewrite', { preHandler: [app.requirePermission('templates', 'create')] }, async (request, reply) => {
    const body = z.object({
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
      bodyText: z.string(),
      issues: z
        .array(z.object({
          severity: z.enum(['error', 'warning']),
          code: z.string(),
          message: z.string(),
          field: z.enum(['body', 'header', 'footer', 'buttons', 'category']),
        }))
        .optional(),
    }).parse(request.body);

    const result = await getAISuggestion({
      module: 'template',
      context: { category: body.category, bodyText: body.bodyText },
      ruleIssues: body.issues,
    });

    return { success: true, data: result };
  });

  app.post('/templates', { preHandler: [app.requirePermission('templates', 'create')] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
      language: z.string().default('en_US'),
      body: z.object({ text: z.string() }),
      // A header is either text or a piece of media. For media, Meta needs a
      // sample file to review, so we keep the uploaded file's path and turn it
      // into a header_handle at submit time.
      header: z.object({
        type: z.string(),
        format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
        text: z.string().optional(),
        sampleUrl: z.string().optional(),
        samplePath: z.string().optional(),
      }).optional(),
      footer: z.string().optional(),
      buttons: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
      // Which connected number's WABA to submit this under — required to
      // disambiguate when a tenant has numbers on more than one WABA;
      // optional (and auto-resolved at submit time) for the common
      // single-number case.
      phoneNumberId: z.string().optional(),
    });

    const body = schema.parse(request.body);

    if (body.phoneNumberId) {
      const owned = await app.prisma.phoneNumber.findFirst({
        where: { id: body.phoneNumberId, tenantId: request.authUser.tenantId! },
        select: { id: true },
      });
      if (!owned) {
        return reply.status(400).send({ success: false, error: { code: 'PHONE_NOT_FOUND', message: 'Selected phone number not found' } });
      }
    }

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
        phoneNumberId: body.phoneNumberId,
        status: 'DRAFT',
      },
    });

    return reply.status(201).send({ success: true, data: template });
  });

  app.patch('/templates/:templateId', { preHandler: [app.requirePermission('templates', 'update')] }, async (request, reply) => {
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

  app.post('/templates/:templateId/submit', { preHandler: [app.requirePermission('templates', 'update')] }, async (request, reply) => {
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

    // Block submission locally if the content would likely be rejected by Meta —
    // this is the real enforcement point, saving a wasted Meta API round-trip.
    const complianceCheck = checkTemplateContent({
      category: template.category,
      bodyText: (template.body as any)?.text || '',
      headerText: (template.header as any)?.text,
      footerText: typeof template.footer === 'string' ? template.footer : (template.footer as any)?.text,
      buttons: (template.buttons as any) || undefined,
    });
    if (!complianceCheck.ok) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TEMPLATE_VALIDATION_FAILED',
          message: 'Template has issues that would likely be rejected by Meta',
          issues: complianceCheck.issues,
        },
      });
    }

    // Update template to PENDING
    const updated = await app.prisma.template.update({
      where: { id: templateId },
      data: { status: 'PENDING', submittedAt: new Date() },
    });

    // Submit to Meta WhatsApp API
    const credentials = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId! },
    });
    const effectiveWabaId = await resolveEffectiveWabaId(app.prisma, request.authUser.tenantId!, credentials?.wabaId, template.phoneNumberId);

    if (credentials?.accessToken && effectiveWabaId) {
      try {
        // Meta rejects any component containing {{n}} variables with
        // INVALID_FORMAT unless it also carries an "example" showing sample
        // values — this was silently missing here, so every template with a
        // variable was guaranteed to be rejected regardless of its content.
        const EXAMPLE_VALUES = ['John', '12345', 'Monday', 'Downtown Store', '$50'];
        const exampleFor = (n: number) => EXAMPLE_VALUES[(n - 1) % EXAMPLE_VALUES.length];
        const variableNumbers = (text: string) =>
          Array.from(new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10)))).sort((a, b) => a - b);

        const components: any[] = [];
        if (template.header) {
          const hdr = template.header as any;
          const format = (hdr.format || 'TEXT').toUpperCase();

          if (format === 'TEXT') {
            const headerText = hdr.text || '';
            const headerVars = variableNumbers(headerText);
            components.push({
              type: 'HEADER',
              format: 'TEXT',
              text: headerText,
              ...(headerVars.length ? { example: { header_text: headerVars.map(exampleFor) } } : {}),
            });
          } else {
            // Media header. Meta will not take a URL here — it wants the sample
            // bytes through the resumable upload API and identifies them by an
            // opaque handle. The handle is minted fresh at submit time rather
            // than stored, because a stale one fails the submission with an
            // error that says nothing about staleness.
            if (!hdr.samplePath) {
              throw new Error(`This template has a ${format} header but no sample file to show Meta. Upload one before submitting.`);
            }
            const appId = process.env.META_APP_ID;
            if (!appId) {
              throw new Error('META_APP_ID is not configured, so sample media cannot be uploaded to Meta.');
            }

            const { readFile } = await import('fs/promises');
            const { campaignMediaDir } = await import('./uploads.js');
            const pathMod = await import('path');

            // Resolve inside the upload directory only, so a tampered
            // samplePath cannot read arbitrary files off the server.
            const dir = campaignMediaDir();
            const resolved = pathMod.resolve(dir, pathMod.basename(hdr.samplePath));
            if (pathMod.dirname(resolved) !== pathMod.resolve(dir)) {
              throw new Error('The header sample file could not be located.');
            }

            const buffer = await readFile(resolved);
            const ext = pathMod.extname(resolved).toLowerCase();
            const MIME: Record<string, string> = {
              '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
              '.mp4': 'video/mp4', '.3gp': 'video/3gpp', '.pdf': 'application/pdf',
            };
            const mimeType = MIME[ext] || 'application/octet-stream';

            const handle = await uploadTemplateHeaderSample(
              decryptSecret(credentials.accessToken),
              appId,
              { buffer, mimeType, fileName: pathMod.basename(resolved) }
            );

            components.push({
              type: 'HEADER',
              format,
              example: { header_handle: [handle] },
            });
          }
        }
        const bodyText = (template.body as any).text || '';
        const bodyVars = variableNumbers(bodyText);
        components.push({
          type: 'BODY',
          ...(template.body as any),
          ...(bodyVars.length ? { example: { body_text: [bodyVars.map(exampleFor)] } } : {}),
        });
        if (template.footer) components.push({ type: 'FOOTER', ...(template.footer as any) });
        if (template.buttons) components.push({ type: 'BUTTONS', buttons: template.buttons as any });

        const metaResult = await submitTemplateToMeta(decryptSecret(credentials.accessToken), effectiveWabaId, {
          name: template.name,
          category: template.category,
          language: template.language,
          components,
        });

        // Update with Meta template ID and normalized name (Meta stores it lowercased with underscores)
        const normalizedName = template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        await app.prisma.template.update({
          where: { id: templateId },
          data: { metaTemplateId: metaResult.id, name: normalizedName },
        });
      } catch (error: any) {
        // If Meta submission fails, revert to DRAFT
        await app.prisma.template.update({
          where: { id: templateId },
          data: { status: 'DRAFT', submittedAt: null },
        });
        return reply.status(400).send({
          success: false,
          error: {
            code: 'META_SUBMIT_FAILED',
            message: `Failed to submit to Meta: ${error.message}`,
          },
        });
      }
    }

    return { success: true, data: updated };
  });

  /**
   * POST /templates/sync - Sync templates from Meta WhatsApp API
   */
  app.post('/templates/sync', { preHandler: [app.requirePermission('templates', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneNumberId } = z.object({ phoneNumberId: z.string().optional() }).parse(request.body || {});

    try {
      const result = await syncTemplatesFromMeta(app.prisma, request.authUser.tenantId, phoneNumberId);

      return {
        success: true,
        data: {
          message: `Synced ${result.synced} new templates, updated ${result.updated} existing templates`,
          synced: result.synced,
          updated: result.updated,
          errors: result.errors,
        },
      };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'SYNC_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * GET /templates/meta - List templates from Meta (without saving)
   */
  app.get('/templates/meta', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneNumberId } = z.object({ phoneNumberId: z.string().optional() }).parse(request.query || {});

    const credentials = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });
    const effectiveWabaId = await resolveEffectiveWabaId(app.prisma, request.authUser.tenantId, credentials?.wabaId, phoneNumberId);

    if (!credentials?.accessToken || !effectiveWabaId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NOT_CONNECTED',
          message: 'WhatsApp Business Account not connected',
        },
      });
    }

    try {
      const templates = await fetchMetaTemplates(decryptSecret(credentials.accessToken), effectiveWabaId);

      return {
        success: true,
        data: templates,
      };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message,
        },
      });
    }
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

  app.delete('/templates/:templateId', { preHandler: [app.requirePermission('templates', 'delete')] }, async (request, reply) => {
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

  app.post('/team/invite', { preHandler: [app.requirePermission('team', 'create')] }, async (request, reply) => {
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
        description: 'description' in a ? a.description : a.action,
        user: a.user,
        createdAt: a.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  app.patch('/team/:userId', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
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

  app.delete('/team/:userId', { preHandler: [app.requirePermission('team', 'delete')] }, async (request, reply) => {
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

  app.post('/team/:userId/resend-invite', { preHandler: [app.requirePermission('team', 'update')] }, async (request, reply) => {
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

  app.post('/phone-numbers/:phoneNumberId/verify', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
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
  app.post('/campaigns/:campaignId/pause', { preHandler: [app.requirePermission('campaigns', 'update')] }, async (request, reply) => {
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
      data: { status: 'PAUSED' as const },
    });

    return { success: true, data: updated };
  });

  app.post('/campaigns/:campaignId/resume', { preHandler: [app.requirePermission('campaigns', 'update')] }, async (request, reply) => {
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

    if (campaign.status !== 'PAUSED') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Only paused campaigns can be resumed' },
      });
    }

    const updated = await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' as const },
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

  app.patch('/settings', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
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

  app.post('/settings/api-key', { preHandler: [app.requirePermission('api_keys', 'create')] }, async (request, reply) => {
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

  app.delete('/settings/api-keys/:keyId', { preHandler: [app.requirePermission('api_keys', 'delete')] }, async (request, reply) => {
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

  app.post('/chatbot/flows', { preHandler: [app.requirePermission('chatbot', 'create')] }, async (request, reply) => {
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

  app.patch('/chatbot/flows/:flowId', { preHandler: [app.requirePermission('chatbot', 'update')] }, async (request, reply) => {
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

  app.delete('/chatbot/flows/:flowId', { preHandler: [app.requirePermission('chatbot', 'delete')] }, async (request, reply) => {
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

  app.get('/analytics/export', { preHandler: [app.requirePermission('analytics', 'export')] }, async (request, reply) => {
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

  /**
   * POST /segments/suggest - Mistral proposes segment conditions from a plain-language
   * goal, constrained to the fields/operators buildSegmentCondition actually supports.
   * The proposed conditions are run through the same query builder as a real segment
   * to return a genuine estimatedCount, not a guess. data: null when AI isn't configured.
   */
  app.post('/segments/suggest', { preHandler: [app.requirePermission('segments', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { goal } = z.object({ goal: z.string().min(1) }).parse(request.body);

    const fields = ['tag', 'city', 'country', 'language', 'company', 'totalMessagesSent', 'lastMessageAt', 'createdAt'];
    const operators = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'within_days'];

    const suggestion = await getAISuggestion({ module: 'segment', context: { goal, fields, operators } });
    if (!suggestion) {
      return { success: true, data: null };
    }

    let parsed: { matchType?: 'all' | 'any'; conditions?: SegmentCondition[] };
    try {
      const jsonText = suggestion.suggestion.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(jsonText);
    } catch {
      return { success: true, data: null };
    }

    const conditions = (parsed.conditions || []).filter(
      (c) => fields.includes(c.field) && operators.includes(c.operator)
    );
    const matchType = parsed.matchType === 'any' ? 'any' : 'all';

    const where = buildSegmentContactWhere({ type: matchType, conditions });
    const estimatedCount = await app.prisma.contact.count({
      where: { ...where, tenantId: request.authUser.tenantId },
    });

    return {
      success: true,
      data: { conditions, matchType, estimatedCount, rationale: suggestion.rationale },
    };
  });

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

  app.post('/segments', { preHandler: [app.requirePermission('segments', 'create')] }, async (request, reply) => {
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

  app.delete('/segments/:segmentId', { preHandler: [app.requirePermission('segments', 'delete')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { segmentId } = z.object({ segmentId: z.string() }).parse(request.params);

    await app.prisma.segment.deleteMany({
      where: { id: segmentId, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { message: 'Segment deleted' } };
  });

  app.patch('/segments/:segmentId', { preHandler: [app.requirePermission('segments', 'update')] }, async (request, reply) => {
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

    const segmentWhere = buildSegmentContactWhere(segment.query as any);
    const where: Prisma.ContactWhereInput = { tenantId: request.authUser.tenantId, ...segmentWhere };

    // Get matching contacts
    const contacts = await app.prisma.contact.findMany({
      where,
      take: query.limit,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    // Get total count
    const total = await app.prisma.contact.count({ where });

    return { success: true, data: { total, matching: contacts } };
  });

  app.post('/segments/:segmentId/sync', { preHandler: [app.requirePermission('segments', 'update')] }, async (request, reply) => {
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

    const segmentWhere = buildSegmentContactWhere(segment.query as any);
    const where: Prisma.ContactWhereInput = { tenantId: request.authUser.tenantId, ...segmentWhere };

    const matchingContacts = await app.prisma.contact.findMany({ where, select: { id: true } });
    const totalContacts = matchingContacts.length;

    // Materialize membership so campaign sends (which read ContactSegment) see current results
    const [, , updated] = await app.prisma.$transaction([
      app.prisma.contactSegment.deleteMany({ where: { segmentId } }),
      app.prisma.contactSegment.createMany({
        data: matchingContacts.map(c => ({ segmentId, contactId: c.id })),
        skipDuplicates: true,
      }),
      app.prisma.segment.update({ where: { id: segmentId }, data: { totalContacts } }),
    ]);

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

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * GET /notifications - List notifications for current user/tenant
   */
  app.get('/notifications', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = paginationSchema.extend({
      unreadOnly: z.string().optional().transform(v => v === 'true'),
      type: z.string().optional(),
    }).parse(request.query);

    const { page, limit, sort, order, unreadOnly, type } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: request.authUser.tenantId,
      isDeleted: false,
      OR: [
        { userId: request.authUser.id },
        { userId: null }, // Tenant-wide notifications
      ],
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    if (type) {
      where.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      (app.prisma as any).notification.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit,
      }),
      (app.prisma as any).notification.count({ where }),
      (app.prisma as any).notification.count({
        where: {
          tenantId: request.authUser.tenantId,
          isRead: false,
          isDeleted: false,
          OR: [
            { userId: request.authUser.id },
            { userId: null },
          ],
        },
      }),
    ]);

    return {
      success: true,
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  });

  /**
   * GET /notifications/unread-count - Get unread notification count
   */
  app.get('/notifications/unread-count', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const count = await (app.prisma as any).notification.count({
      where: {
        tenantId: request.authUser.tenantId,
        isRead: false,
        isDeleted: false,
        OR: [
          { userId: request.authUser.id },
          { userId: null },
        ],
      },
    });

    return { success: true, data: { count } };
  });

  /**
   * PATCH /notifications/:notificationId/read - Mark single notification as read
   */
  app.patch('/notifications/:notificationId/read', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { notificationId } = z.object({ notificationId: z.string() }).parse(request.params);

    const notification = await (app.prisma as any).notification.findFirst({
      where: {
        id: notificationId,
        tenantId: request.authUser.tenantId,
        OR: [
          { userId: request.authUser.id },
          { userId: null },
        ],
      },
    });

    if (!notification) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updated = await (app.prisma as any).notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true, data: updated };
  });

  /**
   * POST /notifications/mark-all-read - Mark all notifications as read
   */
  app.post('/notifications/mark-all-read', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const result = await (app.prisma as any).notification.updateMany({
      where: {
        tenantId: request.authUser.tenantId,
        isRead: false,
        isDeleted: false,
        OR: [
          { userId: request.authUser.id },
          { userId: null },
        ],
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true, data: { markedRead: result.count } };
  });

  /**
   * DELETE /notifications/:notificationId - Delete a notification
   */
  app.delete('/notifications/:notificationId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { notificationId } = z.object({ notificationId: z.string() }).parse(request.params);

    await (app.prisma as any).notification.updateMany({
      where: {
        id: notificationId,
        tenantId: request.authUser.tenantId,
      },
      data: { isDeleted: true },
    });

    return { success: true, data: { message: 'Notification deleted' } };
  });

  /**
   * DELETE /notifications - Delete all notifications
   */
  app.delete('/notifications', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const result = await (app.prisma as any).notification.updateMany({
      where: {
        tenantId: request.authUser.tenantId,
        OR: [
          { userId: request.authUser.id },
          { userId: null },
        ],
      },
      data: { isDeleted: true },
    });

    return { success: true, data: { deleted: result.count } };
  });

  /**
   * GET /notifications/preferences - Get notification preferences
   */
  app.get('/notifications/preferences', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const settings = await app.prisma.tenantSetting.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    return {
      success: true,
      data: {
        emailNotifications: settings?.emailNotifications ?? true,
        deliveryReports: settings?.deliveryReports ?? true,
        weeklyDigest: settings?.weeklyDigest ?? false,
        billingAlerts: settings?.billingAlerts ?? true,
        browserNotifications: settings?.browserNotifications ?? true,
        smsNotifications: settings?.smsNotifications ?? false,
      },
    };
  });

  /**
   * PATCH /notifications/preferences - Update notification preferences
   */
  app.patch('/notifications/preferences', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      emailNotifications: z.boolean().optional(),
      deliveryReports: z.boolean().optional(),
      weeklyDigest: z.boolean().optional(),
      billingAlerts: z.boolean().optional(),
      browserNotifications: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
    }).parse(request.body);

    const updated = await app.prisma.tenantSetting.upsert({
      where: { tenantId: request.authUser.tenantId },
      create: {
        tenantId: request.authUser.tenantId,
        ...body,
      },
      update: body,
    });

    return {
      success: true,
      data: {
        emailNotifications: updated.emailNotifications,
        deliveryReports: updated.deliveryReports,
        weeklyDigest: updated.weeklyDigest,
        billingAlerts: updated.billingAlerts,
        browserNotifications: updated.browserNotifications,
        smsNotifications: updated.smsNotifications,
      },
    };
  });

  /**
   * INTERNAL: Create a notification (used by other services)
   */
  app.post('/notifications/create', async (request, reply) => {
    // This endpoint should be called internally, not directly by clients
    // In production, this would be called by other services via API key auth
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      type: z.string(),
      title: z.string(),
      message: z.string(),
      userId: z.string().optional(),
      referenceType: z.string().optional(),
      referenceId: z.string().optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
      data: z.any().optional(),
    }).parse(request.body);

    const notification = await (app.prisma as any).notification.create({
      data: {
        tenantId: request.authUser.tenantId,
        userId: body.userId || request.authUser.id,
        type: body.type as any,
        title: body.title,
        message: body.message,
        referenceType: body.referenceType,
        referenceId: body.referenceId,
        priority: body.priority as any,
        data: body.data,
      },
    });

    return reply.status(201).send({ success: true, data: notification });
  });
}

// ============================================
// Helper: Create Notification (for internal use)
// ============================================

export async function createNotification(
  prisma: any,
  data: {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    message: string;
    referenceType?: string;
    referenceId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    data?: any;
  }
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        type: data.type as any,
        title: data.title,
        message: data.message,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        priority: data.priority as any || 'NORMAL',
        data: data.data,
      },
    });
  } catch (error) {
    // Don't fail the main operation if notification creation fails
    console.error('Failed to create notification:', error);
  }
}

// ============================================
// Campaign Message Sender
// ============================================

/**
 * Maps a media URL to the Meta header parameter shape for its type. Meta keys
 * the parameter by media kind rather than accepting a generic "url", so the
 * extension decides which of image/video/document to send.
 */
function mediaHeaderParameter(mediaUrl: string): any {
  const ext = mediaUrl.split('?')[0].split('.').pop()?.toLowerCase() || '';

  if (['mp4', '3gp'].includes(ext)) {
    return { type: 'video', video: { link: mediaUrl } };
  }
  if (ext === 'pdf') {
    return { type: 'document', document: { link: mediaUrl } };
  }
  return { type: 'image', image: { link: mediaUrl } };
}

/**
 * Removes a campaign's uploaded header media once it can no longer be needed.
 * Meta fetches the file during the send, so this must run only after the
 * campaign reaches a terminal state — never mid-send.
 */
async function cleanUpCampaignMedia(app: FastifyInstance, campaignId: string): Promise<void> {
  try {
    const campaign = await app.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { mediaPath: true },
    });
    if (!campaign?.mediaPath) return;

    const { deleteCampaignMedia } = await import('./uploads.js');
    await deleteCampaignMedia(campaign.mediaPath);

    // Drop the now-dangling URL too, so the UI stops offering a dead link.
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { mediaUrl: null, mediaPath: null },
    });
    console.log(`[Campaign] ${campaignId} media cleaned up`);
  } catch (err: any) {
    // Cleanup is housekeeping — a failure here must never change the campaign's
    // outcome, so it is logged and swallowed.
    console.error(`[Campaign] ${campaignId} media cleanup failed:`, err?.message);
  }
}

export async function sendCampaignMessages(
  app: FastifyInstance,
  campaignId: string,
  tenantId: string
): Promise<void> {
  try {
    await sendCampaignMessagesInner(app, campaignId, tenantId);
  } catch (err: any) {
    // Last-resort safety net: an unexpected error anywhere in the send path
    // must never leave a campaign stuck in SENDING forever (as happened when
    // a Prisma validation error crashed the batch loop before any status
    // update could run) — always resolve to a terminal status.
    console.error(`Campaign ${campaignId} send failed unexpectedly:`, err.message);
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED', completedAt: new Date() },
    }).catch(() => {});
  } finally {
    // Runs for both the success and failure paths — a campaign that died
    // partway through still leaves an uploaded file that nothing will use.
    await cleanUpCampaignMedia(app, campaignId);
  }
}

async function sendCampaignMessagesInner(
  app: FastifyInstance,
  campaignId: string,
  tenantId: string
): Promise<void> {
  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId, tenantId },
    include: {
      template: true,
      phoneNumber: true,
    },
  });

  if (!campaign) return;

  // The routes validate these ids on the way in, but this is the last gate
  // before real messages go out on a real WhatsApp number, and campaign rows
  // created before that validation existed may still carry foreign ids.
  // Sending from another tenant's number is not a recoverable mistake.
  if (
    (campaign.template && campaign.template.tenantId !== tenantId) ||
    (campaign.phoneNumber && campaign.phoneNumber.tenantId !== tenantId)
  ) {
    console.error(`[Campaign] ${campaignId} references another tenant's template or phone number — refusing to send`);
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED', completedAt: new Date() },
    }).catch(() => {});
    return;
  }

  // Build audience contacts
  let contactIds: string[] = [];

  if (campaign.audienceType === 'contacts' && campaign.contactIds.length > 0) {
    // Filter out opted-out contacts. Scoped by tenant: an unscoped `id IN (...)`
    // here would message another tenant's customers and copy their numbers into
    // this tenant's message log.
    const contacts = await app.prisma.contact.findMany({
      where: { id: { in: campaign.contactIds }, tenantId, consentStatus: { not: 'OPTED_OUT' } },
      select: { id: true },
    });
    contactIds = contacts.map(c => c.id);
  } else if (campaign.audienceType === 'segment' && campaign.segmentIds.length > 0) {
    // Evaluate segments live against current contact data (excluding opted-out)
    const segments = await app.prisma.segment.findMany({
      where: { id: { in: campaign.segmentIds }, tenantId },
    });
    const segmentContacts = await app.prisma.contact.findMany({
      where: {
        tenantId,
        consentStatus: { not: 'OPTED_OUT' },
        OR: segments.map(s => buildSegmentContactWhere(s.query as any)),
      },
      select: { id: true },
    });
    contactIds = segmentContacts.map(c => c.id);
  } else if (campaign.audienceType === 'all') {
    // Fetch all active contacts for 'all' audience type (excluding opted-out)
    const allContacts = await app.prisma.contact.findMany({
      where: { tenantId, isActive: true, consentStatus: { not: 'OPTED_OUT' } },
      select: { id: true },
    });
    contactIds = allContacts.map(c => c.id);
  }

  // Resume-safety: exclude contacts who already have a message logged for this
  // campaign (e.g. this is a restart-triggered resume of a SENDING campaign),
  // so a process restart mid-send never double-sends or double-charges credits.
  const alreadyMessaged = await app.prisma.message.findMany({
    where: { campaignId, contactId: { in: contactIds } },
    select: { contactId: true },
  });
  const alreadyMessagedIds = new Set(alreadyMessaged.map((m) => m.contactId));
  contactIds = contactIds.filter((id) => !alreadyMessagedIds.has(id));

  if (contactIds.length === 0) {
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return;
  }

  // Get contacts in batches
  // Batching is sized for bulk. Credits are reserved once per batch rather than
  // once per message, so the number of database transactions no longer scales
  // with recipients — that per-message transaction was what exhausted the
  // connection pool and forced concurrency down to three, which made a
  // thousand-recipient campaign take the better part of an hour.
  const BATCH_SIZE = 50;

  // Meta's Cloud API accepts well above this; the limit here is our own database
  // and a wish not to look like a burst to Meta's throttles.
  const SEND_CONCURRENCY = 12;

  // Between batches only, not between messages.
  const RATE_LIMIT_DELAY = 400;

  /** Runs tasks with a fixed number in flight, preserving completion semantics. */
  const runWithConcurrency = async (tasks: Array<() => Promise<void>>, limit: number) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++];
        await task();
      }
    });
    await Promise.all(workers);
  };

  // Seed running totals from any progress already persisted by a prior run
  const priorTotals = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { totalSent: true, totalFailed: true },
  });
  let sent = priorTotals?.totalSent || 0;
  let failed = priorTotals?.totalFailed || 0;

  // Set when a deduction is refused. Without it the loop would keep trying every
  // remaining recipient and failing each one individually, turning one problem
  // into hundreds of identical failures the tenant has to read through.
  let outOfCredits = false;

  // Meta throttle responses seen in the current batch. Used to slow the next
  // one down rather than continuing at a rate Meta has just rejected.
  let rateLimitHits = 0;

  // Grows when Meta throttles and decays when a batch passes cleanly, so a busy
  // period slows the campaign instead of failing it.
  let adaptiveDelay = RATE_LIMIT_DELAY;
  const MAX_ADAPTIVE_DELAY = 30_000;

  // Meta caps how many unique customers a number may message per rolling 24h.
  // Checked as the campaign runs, not only at creation: a long campaign can
  // cross the line partway, and every recipient after that is rejected. Stopping
  // cleanly leaves a resumable campaign instead of thousands of failures.
  const { checkTierCapacity } = await import('../services/sendQuota.js');
  let tierExhausted = false;

  const { dispatchOutboundMessage } = await import('../services/whatsappService.js');

  const { reserveCreditsForBatch, releaseUnusedReservation, getRateCredits } =
    await import('../services/creditService.js') as any;
  const templateCategory = campaign.template?.category || 'UTILITY';

  // The rate fallback used to be 'US' while the schema default was 'IN', so the
  // two disagreed about the same contact. Both now defer to the tenant's own
  // market, which is the only defensible guess when a contact has no country.
  const campaignTenant = await app.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultCountry: true },
  });
  const tenantDefaultCountry = campaignTenant?.defaultCountry || 'IN';

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const contacts = await app.prisma.contact.findMany({
      where: { id: { in: batch }, tenantId },
    });

    // Reserve the whole batch in one transaction. Rates are per-country, so the
    // cost of each recipient is worked out first and the reservation covers as
    // many as the balance allows — a tenant short on credits sends what they can
    // afford instead of the campaign failing wholesale or, before this, sending
    // the remainder free.
    const unitCosts = contacts.map((c) => getRateCredits(c.country || tenantDefaultCountry, templateCategory));
    const reservation = await reserveCreditsForBatch(
      app.prisma, tenantId, unitCosts, campaignId,
      `Campaign: ${campaign.name} (batch of ${contacts.length})`,
    );

    if (reservation.reservedFor === 0) {
      outOfCredits = true;
      console.log(`[Campaign] ${campaignId} halted before batch: insufficient credits`);
      break;
    }

    // Anyone the reservation could not cover is failed up front with a reason,
    // rather than attempted and rejected one at a time.
    const affordable = contacts.slice(0, reservation.reservedFor);
    const unaffordable = contacts.slice(reservation.reservedFor);
    if (unaffordable.length > 0) {
      outOfCredits = true;
      failed += unaffordable.length;
    }

    // Credits actually consumed by messages Meta accepted; the rest is returned
    // in a single call once the batch settles.
    let consumed = 0;

    const phoneTasks = affordable.map((contact) => async () => {
      // Every Message row requires a conversationId — find or create the
      // (tenant, contact, phone) conversation before touching Message at all,
      // for both the success and failure logging paths below. Missing this
      // used to throw a Prisma validation error that silently killed the
      // whole Promise.all and left the campaign stuck in SENDING forever.
      let conversationId: string;
      try {
        const conversation = await app.prisma.conversation.upsert({
          where: {
            contactId_phoneNumberId_tenantId: {
              contactId: contact.id,
              phoneNumberId: campaign.phoneNumberId!,
              tenantId,
            },
          },
          update: {},
          create: {
            tenantId,
            contactId: contact.id,
            phoneNumberId: campaign.phoneNumberId!,
            status: 'OPEN',
          },
        });
        conversationId = conversation.id;
      } catch (err: any) {
        console.error(`Failed to get/create conversation for ${contact.phone}:`, err.message);
        failed++;
        return;
      }

      const messageBody = (campaign.template!.body as any)?.text || '';

      // Tracked outside the try so the catch can close the message out. An
      // exception mid-send used to increment the failure count and leave the row
      // PENDING for ever, which is why recipients showed a blank status and no
      // reason — the campaign said it failed but the message never said why.
      let createdMessageId: string | null = null;

      try {
        if (!campaign.template || !campaign.phoneNumber?.metaPhoneId) return;

        // Meta's template message API substitutes {{n}} variables via a
        // parameters array on the BODY component — it does not accept a bare
        // "text" key on the component (that shape was always rejected by
        // Meta with "Unexpected key text on param template.components.0").
        // There's no per-contact variable-mapping UI yet, so every {{n}} is
        // filled with the contact's name as a reasonable default.
        const variableCount = new Set(
          [...messageBody.matchAll(/\{\{(\d+)\}\}/g)].map((m: any) => m[1])
        ).size;
        const components: any[] = [];

        // A header component only belongs on the payload when the campaign
        // actually carries media AND the template was approved with a header to
        // hold it. Sending one to a body-only template fails every recipient
        // with #132018 ("Template does not contain title component"). The send
        // route refuses this combination up front; this covers the paths that
        // do not go through it, such as a scheduled or resumed campaign.
        if (campaign.mediaUrl && campaign.template.header) {
          components.push({
            type: 'header',
            parameters: [mediaHeaderParameter(campaign.mediaUrl)],
          });
        }

        if (variableCount > 0) {
          components.push({
            type: 'body',
            parameters: Array.from({ length: variableCount }, () => ({
              type: 'text' as const,
              text: contact.name || contact.phone,
            })),
          });
        }

        // Create the message record first (PENDING), then dispatch — mirrors
        // the already-verified-working /messages/send path, which uses each
        // tenant's own connected credentials rather than a shared platform
        // token (the previous WhatsAppAPIClient/getDefaultConfig() approach
        // ignored per-tenant credentials entirely).
        const message = await (app.prisma.message.create as any)({
          data: {
            tenantId,
            conversationId,
            campaignId,
            contactId: contact.id,
            phoneNumberId: campaign.phoneNumberId!,
            direction: 'OUTGOING',
            type: 'TEMPLATE',
            body: messageBody,
            status: 'PENDING',
          },
        });
        createdMessageId = message.id;

        // Credits for this recipient were already taken as part of the batch
        // reservation above, so there is no per-message transaction here — that
        // is what makes bulk throughput possible. Only what Meta accepts is
        // counted as consumed; the balance of the reservation is returned once
        // the batch settles.
        const costCredits = getRateCredits(contact.country || tenantDefaultCountry, templateCategory);

        const dispatchResult = await dispatchOutboundMessage({
          app,
          messageId: message.id,
          tenantId,
          contactPhone: contact.phone,
          phoneNumberId: campaign.phoneNumberId!,
          body: messageBody,
          type: 'template',
          template: {
            name: campaign.template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            language: campaign.template.language,
            components,
          },
        });

        if (!dispatchResult.success) {
          // Meta throttling is a pacing signal, not a per-recipient defect —
          // record it so the loop slows down instead of driving the rest of the
          // campaign into the same wall.
          if ((dispatchResult as any).rateLimited) rateLimitHits++;
          const dispatchErr: any = new Error(dispatchResult.error || 'Dispatch failed');
          // Carry Meta's code through the throw so the catch does not have to
          // guess, and does not flatten every failure into one generic code.
          dispatchErr.metaErrorCode = (dispatchResult as any).errorCode;
          throw dispatchErr;
        }

        consumed += costCredits;

        sent++;
      } catch (err: any) {
        console.error(`Failed to send to ${contact.phone}:`, err.message);
        failed++;

        // Record why on the message itself, so the campaign view shows a reason
        // instead of a recipient stuck on PENDING with a blank detail column.
        // The dispatcher has already written Meta's own error code when it was
        // the dispatcher that failed. Overwriting it with a generic
        // 'SEND_ERROR' threw away the one field that says what Meta actually
        // objected to -- every recipient in a failed campaign read SEND_ERROR
        // while the real code sat in the logs. Only fill in a code when the
        // failure came from somewhere the dispatcher never reached.
        if (createdMessageId) {
          const dispatchCode = (err as any)?.metaErrorCode as string | undefined;
          await app.prisma.message.update({
            where: { id: createdMessageId },
            data: {
              status: 'FAILED',
              errorCode: dispatchCode || 'SEND_ERROR',
              errorMessage: (err?.message || 'Send failed').slice(0, 500),
              failedAt: new Date(),
            },
          }).catch(() => {
            // Already logged above; a failed status write must not mask it.
          });
        }
      }
    });

    await runWithConcurrency(phoneTasks, SEND_CONCURRENCY);

    // Recipients the reservation could not cover are counted above but get no
    // message row. A Message requires a conversation, and manufacturing one for
    // a send that never happened would put a conversation in the tenant's inbox
    // for a customer who was never contacted. They were not attempted, so there
    // is nothing to show — the campaign is marked FAILED and the shortfall
    // logged, which is the honest record.
    if (unaffordable.length > 0) {
      console.log(
        `[Campaign] ${campaignId}: ${unaffordable.length} recipient(s) not attempted — insufficient credits`,
      );
    }

    // Settle the reservation: give back whatever Meta did not accept, in one
    // call rather than one per failed recipient.
    const unused = reservation.reservedAmount - consumed;
    if (unused > 0) {
      await releaseUnusedReservation(
        app.prisma, tenantId, unused, campaignId,
        `Unused reservation — ${campaign.name}`,
      ).catch((e: any) => console.error(`[Credits] could not return unused reservation:`, e?.message));
    }

    // Persist progress after every batch so a crash/restart mid-campaign
    // leaves an accurate totalSent/totalFailed count instead of 0, and so
    // the resume-safety check above has real data to dedupe against.
    await app.prisma.campaign.update({
      where: { id: campaignId },
      data: { totalSent: sent, totalFailed: failed, lastSentAt: new Date() },
    });

    // Stop as soon as the balance runs out. Continuing would attempt every
    // remaining recipient and fail each one the same way.
    if (outOfCredits) {
      const remaining = contactIds.length - Math.min(i + BATCH_SIZE, contactIds.length);
      console.log(`[Campaign] ${campaignId} halted: out of credits, ${remaining} recipient(s) not attempted`);
      break;
    }

    // Stop at Meta's 24h unique-recipient cap rather than pushing into it.
    const tier = await checkTierCapacity(app.prisma, campaign.phoneNumberId!, 1);
    if (!tier.withinTier) {
      tierExhausted = true;
      const remaining = contactIds.length - Math.min(i + BATCH_SIZE, contactIds.length);
      console.log(
        `[Campaign] ${campaignId} halted: Meta ${tier.usage.tier} limit reached ` +
        `(${tier.usage.uniqueCustomers24h}/${tier.usage.limit} in 24h), ${remaining} recipient(s) not attempted`,
      );
      break;
    }

    // Back off when Meta pushed back, recover when it didn't.
    if (rateLimitHits > 0) {
      adaptiveDelay = Math.min(adaptiveDelay * 2, MAX_ADAPTIVE_DELAY);
      console.log(`[Campaign] ${campaignId}: ${rateLimitHits} throttled, slowing to ${adaptiveDelay}ms between batches`);
      rateLimitHits = 0;
    } else if (adaptiveDelay > RATE_LIMIT_DELAY) {
      adaptiveDelay = Math.max(RATE_LIMIT_DELAY, Math.floor(adaptiveDelay / 2));
    }

    if (i + BATCH_SIZE < contactIds.length) {
      await new Promise((r) => setTimeout(r, adaptiveDelay));
    }
  }

  // A campaign stopped short is not "completed" — calling it that hides why it
  // never reached the rest of its recipient list. A tier stop is recoverable:
  // the resume path skips anyone already messaged, so re-running it tomorrow
  // picks up where it left off rather than double-sending.
  const haltedEarly = outOfCredits || tierExhausted;
  await (app.prisma.campaign.update as any)({
    where: { id: campaignId },
    data: {
      status: haltedEarly ? 'FAILED' : 'COMPLETED',
      totalSent: sent,
      totalFailed: failed,
      completedAt: new Date(),
      lastSentAt: new Date(),
    },
  });

  const reason = outOfCredits ? 'halted (out of credits)'
    : tierExhausted ? 'halted (Meta 24h limit reached — resume tomorrow)'
    : 'completed';
  console.log(`[Campaign] ${campaignId} ${reason}: ${sent} sent, ${failed} failed`);
}

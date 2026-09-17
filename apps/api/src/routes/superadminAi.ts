/**
 * AI manager, superadmin only.
 *
 * Provider and key were environment variables, which made choosing between
 * Mistral and OpenAI a redeploy, and nothing recorded what AI cost or who spent
 * it. This is the one place where all of it is set and seen: which model
 * answers, what it is allowed to spend, which workspace spent it, and what
 * failed.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getProviderStatus,
  saveProviderSettings,
  testProvider,
  clearProviderCache,
  listModels,
  PROVIDERS,
} from '../services/aiProvider.js';
import {
  getLimits,
  saveLimits,
  clearLimitsCache,
  DEFAULT_LIMITS,
  MICRO,
} from '../services/aiGovernor.js';
import { countStaleChunks } from '../services/knowledgeBase.js';
import { requireSuperadmin } from '../middleware/auth.js';

/** Rupees from millionths, for display. */
const rupees = (micro: number) => Math.round((micro / MICRO) * 100) / 100;

function windowStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function registerAiAdminRoutes(app: FastifyInstance) {
  // Every route below is platform configuration. Without this a tenant's own
  // token reached them -- readable provider settings, and writable API keys.
  app.addHook('preHandler', requireSuperadmin());

  /** Providers, keys, limits and the knowledge-base compatibility warning. */
  app.get('/ai', async () => {
    const [status, limits] = await Promise.all([
      getProviderStatus(app.prisma),
      getLimits(app.prisma),
    ]);

    // Switching provider changes the embedding model, and vectors from two
    // models are not comparable. Report how many stored chunks the current
    // provider cannot search, so the consequence is visible before it shows up
    // as a chatbot that has forgotten everything.
    let knowledge: { total: number; stale: number; expectedDimensions: number } | null = null;
    try {
      knowledge = await countStaleChunks(app.prisma);
    } catch {
      knowledge = null;
    }

    // Spend against the cap, so a budget that is nearly gone is visible before
    // it starts refusing calls.
    const month = await app.prisma.aiUsage.aggregate({
      where: { createdAt: { gte: monthStart() } },
      _sum: { costMicro: true, totalTokens: true },
      _count: { _all: true },
    });

    return {
      success: true,
      data: {
        ...status,
        limits,
        defaults: DEFAULT_LIMITS,
        knowledge,
        thisMonth: {
          calls: month._count._all,
          tokens: month._sum.totalTokens ?? 0,
          spend: rupees(month._sum.costMicro ?? 0),
          budget: limits.monthlyBudget,
        },
      },
    };
  });

  /** Set the active provider, a key, or a model name. */
  app.patch('/ai', async (request, reply) => {
    const body = z
      .object({
        provider: z.enum(['mistral', 'openai']).optional(),
        forProvider: z.enum(['mistral', 'openai']).optional(),
        apiKey: z.string().min(10).max(500).optional(),
        chatModel: z.string().min(1).max(100).optional(),
      })
      .parse(request.body);

    if (!body.provider && !body.apiKey && !body.chatModel) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NOTHING_TO_UPDATE', message: 'Provide a provider, an API key or a model name.' },
      });
    }

    if ((body.apiKey || body.chatModel) && !body.forProvider && !body.provider) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PROVIDER_REQUIRED', message: 'Say which provider the key or model belongs to.' },
      });
    }

    await saveProviderSettings(app.prisma, body);
    return { success: true, data: await getProviderStatus(app.prisma) };
  });

  /** Limits, budget and model prices. */
  app.patch('/ai/limits', async (request) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        dailyTokenLimit: z.number().int().min(0).max(100_000_000).optional(),
        monthlyTokenLimit: z.number().int().min(0).max(1_000_000_000).optional(),
        requestsPerMinute: z.number().int().min(0).max(10_000).optional(),
        monthlyBudget: z.number().min(0).max(10_000_000).optional(),
        prices: z
          .record(
            z.object({
              inputPerMillion: z.number().min(0).max(1_000_000),
              outputPerMillion: z.number().min(0).max(1_000_000),
            }),
          )
          .optional(),
      })
      .parse(request.body);

    const limits = await saveLimits(app.prisma, body);
    return { success: true, data: limits };
  });

  /**
   * What the provider will actually serve.
   *
   * Typed model names are a common way to break AI silently — the call 404s
   * and every feature just stops suggesting. This lists what the key can reach
   * so the panel can offer a choice instead of a free-text field.
   */
  app.get('/ai/models', async (request) => {
    const q = z.object({ provider: z.enum(['mistral', 'openai']).optional() }).parse(request.query ?? {});
    const models = await listModels(app.prisma, q.provider);
    return { success: true, data: models };
  });

  /**
   * Usage: who spent what, on which model, through which feature.
   *
   * Nothing recorded this before, so none of these questions had an answer.
   */
  app.get('/ai/usage', async (request) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query ?? {});
    const since = windowStart(days);
    const where = { createdAt: { gte: since } };

    const [totals, failures, byTenant, byModel, byFeature, errorCodes] = await Promise.all([
      app.prisma.aiUsage.aggregate({
        where,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, costMicro: true },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      app.prisma.aiUsage.count({ where: { ...where, ok: false } }),
      app.prisma.aiUsage.groupBy({
        by: ['tenantId'],
        where,
        _sum: { totalTokens: true, costMicro: true },
        _count: { _all: true },
      }),
      app.prisma.aiUsage.groupBy({
        by: ['model'],
        where,
        _sum: { totalTokens: true, costMicro: true },
        _count: { _all: true },
      }),
      app.prisma.aiUsage.groupBy({
        by: ['feature'],
        where,
        _sum: { totalTokens: true, costMicro: true },
        _count: { _all: true },
      }),
      app.prisma.aiUsage.groupBy({
        by: ['errorCode'],
        where: { ...where, ok: false },
        _count: { _all: true },
      }),
    ]);

    // Names and policies for the tenant rows, in one query each rather than
    // one per row.
    const ids = byTenant.map((t) => t.tenantId).filter((x): x is string => !!x);
    const names = new Map(
      (await app.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
        .map((t) => [t.id, t.name]),
    );
    const policies = new Map(
      (await app.prisma.aiTenantPolicy.findMany({ where: { tenantId: { in: ids } } }))
        .map((p) => [p.tenantId, p]),
    );

    const limits = await getLimits(app.prisma);

    return {
      success: true,
      data: {
        days,
        since,
        totals: {
          calls: totals._count._all,
          failed: failures,
          promptTokens: totals._sum.promptTokens ?? 0,
          completionTokens: totals._sum.completionTokens ?? 0,
          tokens: totals._sum.totalTokens ?? 0,
          spend: rupees(totals._sum.costMicro ?? 0),
          avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
        },
        byTenant: byTenant
          .map((t) => ({
            tenantId: t.tenantId,
            name: t.tenantId ? names.get(t.tenantId) ?? 'Deleted workspace' : 'Platform',
            calls: t._count._all,
            tokens: t._sum.totalTokens ?? 0,
            spend: rupees(t._sum.costMicro ?? 0),
            policy: t.tenantId ? policies.get(t.tenantId) ?? null : null,
            effectiveDaily: t.tenantId
              ? policies.get(t.tenantId)?.dailyTokenLimit ?? limits.dailyTokenLimit
              : null,
            enabled: t.tenantId ? policies.get(t.tenantId)?.enabled ?? true : true,
          }))
          .sort((a, b) => b.tokens - a.tokens),
        byModel: byModel
          .map((m) => ({
            model: m.model,
            calls: m._count._all,
            tokens: m._sum.totalTokens ?? 0,
            spend: rupees(m._sum.costMicro ?? 0),
          }))
          .sort((a, b) => b.tokens - a.tokens),
        byFeature: byFeature
          .map((f) => ({
            feature: f.feature,
            calls: f._count._all,
            tokens: f._sum.totalTokens ?? 0,
            spend: rupees(f._sum.costMicro ?? 0),
          }))
          .sort((a, b) => b.calls - a.calls),
        errors: errorCodes
          .map((e) => ({ code: e.errorCode || 'UNKNOWN', count: e._count._all }))
          .sort((a, b) => b.count - a.count),
      },
    };
  });

  /** Per-workspace override. Absent fields fall back to the platform default. */
  app.put('/ai/policy/:tenantId', async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        dailyTokenLimit: z.number().int().min(0).max(100_000_000).nullable().optional(),
        monthlyTokenLimit: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
        requestsPerMinute: z.number().int().min(0).max(10_000).nullable().optional(),
        note: z.string().max(300).nullable().optional(),
      })
      .parse(request.body);

    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'No such workspace.' },
      });
    }

    const policy = await app.prisma.aiTenantPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...body },
      update: body,
    });
    return { success: true, data: policy };
  });

  /** Removes an override so the workspace follows the platform default again. */
  app.delete('/ai/policy/:tenantId', async (request) => {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
    await app.prisma.aiTenantPolicy.deleteMany({ where: { tenantId } });
    return { success: true, data: { tenantId, reset: true } };
  });

  /**
   * Sends one real request. "A key is stored" and "the key works" are
   * different claims, and only this one can make the second.
   */
  app.post('/ai/test', async (request) => {
    const body = z
      .object({ provider: z.enum(['mistral', 'openai']).optional() })
      .parse(request.body ?? {});
    const result = await testProvider(app.prisma, body.provider);
    return { success: true, data: result };
  });

  /** Drops cached provider and limits, for when a key is rotated out of band. */
  app.post('/ai/reload', async () => {
    clearProviderCache();
    clearLimitsCache();
    return { success: true, data: await getProviderStatus(app.prisma) };
  });
}

/**
 * What AI costs, who is allowed to spend it, and what actually happened.
 *
 * The provider layer decides *which* model answers. This decides *whether* it
 * should: a global switch, a monthly money cap, per-tenant token budgets and a
 * requests-per-minute ceiling — and it records every call so those numbers
 * come from measurement rather than assumption.
 *
 * Before this, nothing recorded AI usage at all. There was no way to answer
 * which tenant was spending the budget, whether a model was being used, or how
 * often calls failed, and therefore no basis on which to limit anything. A
 * single tenant looping a chatbot could have run the bill up unbounded and the
 * first sign of it would have been the invoice.
 */
import type { PrismaClient } from '@prisma/client';

/** Millionths of a rupee. Per-call costs are far below one paisa. */
export const MICRO = 1_000_000;

export interface ModelPrice {
  /** Rupees per million prompt tokens. */
  inputPerMillion: number;
  /** Rupees per million completion tokens. */
  outputPerMillion: number;
}

/**
 * Starting prices, in rupees per million tokens.
 *
 * Neither vendor publishes prices through an API, so these are entered rather
 * than fetched, and they are only as current as whoever last checked. They are
 * editable from the panel for exactly that reason, and every cost figure in the
 * product says it is an estimate.
 */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'gpt-4.1-mini': { inputPerMillion: 35, outputPerMillion: 140 },
  'gpt-4.1-nano': { inputPerMillion: 9, outputPerMillion: 35 },
  'gpt-4o-mini': { inputPerMillion: 13, outputPerMillion: 53 },
  'gpt-5-mini': { inputPerMillion: 22, outputPerMillion: 177 },
  'gpt-5-nano': { inputPerMillion: 4, outputPerMillion: 35 },
  'mistral-small-latest': { inputPerMillion: 9, outputPerMillion: 26 },
  'mistral-large-latest': { inputPerMillion: 177, outputPerMillion: 531 },
};

export interface AiLimits {
  /** Global off switch. Nothing calls a provider while this is false. */
  enabled: boolean;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  requestsPerMinute: number;
  /** Rupees per calendar month across all tenants. 0 means no cap. */
  monthlyBudget: number;
  prices: Record<string, ModelPrice>;
}

export const DEFAULT_LIMITS: AiLimits = {
  enabled: true,
  dailyTokenLimit: 100_000,
  monthlyTokenLimit: 2_000_000,
  requestsPerMinute: 20,
  monthlyBudget: 0,
  prices: DEFAULT_PRICES,
};

const SETTING = 'ai_limits';

let limitsCache: AiLimits | null = null;

export async function getLimits(prisma: PrismaClient): Promise<AiLimits> {
  if (limitsCache) return limitsCache;

  let resolved: AiLimits;
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: SETTING } });
    const parsed = row?.value ? JSON.parse(row.value) : {};
    // Merged over the defaults rather than replacing them, so a setting saved
    // before a new field existed does not leave that field undefined.
    resolved = {
      ...DEFAULT_LIMITS,
      ...parsed,
      prices: { ...DEFAULT_PRICES, ...(parsed.prices || {}) },
    };
  } catch {
    resolved = DEFAULT_LIMITS;
  }
  limitsCache = resolved;
  return resolved;
}

export async function saveLimits(prisma: PrismaClient, patch: Partial<AiLimits>): Promise<AiLimits> {
  const current = await getLimits(prisma);
  const next: AiLimits = {
    ...current,
    ...patch,
    prices: { ...current.prices, ...(patch.prices || {}) },
  };
  await prisma.platformSetting.upsert({
    where: { key: SETTING },
    create: { key: SETTING, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  limitsCache = next;
  return next;
}

export function clearLimitsCache(): void {
  limitsCache = null;
}

/** Cost of one call in millionths of a rupee. */
export function costMicro(
  prices: Record<string, ModelPrice>,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = prices[model];
  if (!price) return 0;
  const inMicro = (promptTokens / 1_000_000) * price.inputPerMillion * MICRO;
  const outMicro = (completionTokens / 1_000_000) * price.outputPerMillion * MICRO;
  return Math.round(inMicro + outMicro);
}

// ============================================
// RATE LIMITING
// ============================================

/**
 * Requests-per-minute, held in memory.
 *
 * A burst ceiling only has to stop a runaway loop, and a loop hits the same
 * process. Token budgets — the ones that cost money — are counted in the
 * database, so those survive a restart and hold across instances.
 */
const recentCalls = new Map<string, number[]>();

function withinRpm(key: string, limit: number, now: number): boolean {
  const cutoff = now - 60_000;
  const calls = (recentCalls.get(key) || []).filter((t) => t > cutoff);
  if (calls.length >= limit) {
    recentCalls.set(key, calls);
    return false;
  }
  calls.push(now);
  recentCalls.set(key, calls);
  // Keep the map from growing without bound on a long-lived process.
  if (recentCalls.size > 5000) {
    for (const [k, v] of recentCalls) {
      if (v.every((t) => t <= cutoff)) recentCalls.delete(k);
    }
  }
  return true;
}

export interface GateResult {
  allowed: boolean;
  /** Machine-readable, so callers can distinguish "off" from "over budget". */
  reason?: 'AI_DISABLED' | 'TENANT_DISABLED' | 'RATE_LIMITED' | 'DAILY_TOKENS' | 'MONTHLY_TOKENS' | 'BUDGET';
  detail?: string;
}

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(now: Date): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Decides whether one call may proceed.
 *
 * Checked in increasing order of cost: the in-memory switch and burst ceiling
 * first, the aggregate queries only if those pass, so a rate-limited caller
 * does not also generate database load.
 */
export async function checkAllowed(
  prisma: PrismaClient,
  tenantId: string | null,
): Promise<GateResult> {
  const limits = await getLimits(prisma);
  if (!limits.enabled) {
    return { allowed: false, reason: 'AI_DISABLED', detail: 'AI is switched off for the platform.' };
  }

  const policy = tenantId
    ? await prisma.aiTenantPolicy.findUnique({ where: { tenantId } }).catch(() => null)
    : null;

  if (policy && !policy.enabled) {
    return { allowed: false, reason: 'TENANT_DISABLED', detail: 'AI is switched off for this workspace.' };
  }

  const rpm = policy?.requestsPerMinute ?? limits.requestsPerMinute;
  if (rpm > 0 && !withinRpm(tenantId || 'platform', rpm, Date.now())) {
    return {
      allowed: false,
      reason: 'RATE_LIMITED',
      detail: `More than ${rpm} AI requests in a minute. Try again shortly.`,
    };
  }

  const now = new Date();
  const dailyLimit = policy?.dailyTokenLimit ?? limits.dailyTokenLimit;
  const monthlyLimit = policy?.monthlyTokenLimit ?? limits.monthlyTokenLimit;

  if (tenantId && (dailyLimit > 0 || monthlyLimit > 0)) {
    const [today, month] = await Promise.all([
      dailyLimit > 0
        ? prisma.aiUsage.aggregate({
            where: { tenantId, createdAt: { gte: startOfDay(now) } },
            _sum: { totalTokens: true },
          })
        : null,
      monthlyLimit > 0
        ? prisma.aiUsage.aggregate({
            where: { tenantId, createdAt: { gte: startOfMonth(now) } },
            _sum: { totalTokens: true },
          })
        : null,
    ]);

    if (dailyLimit > 0 && (today?._sum.totalTokens ?? 0) >= dailyLimit) {
      return {
        allowed: false,
        reason: 'DAILY_TOKENS',
        detail: `This workspace has used its ${dailyLimit.toLocaleString('en-IN')} daily AI tokens.`,
      };
    }
    if (monthlyLimit > 0 && (month?._sum.totalTokens ?? 0) >= monthlyLimit) {
      return {
        allowed: false,
        reason: 'MONTHLY_TOKENS',
        detail: `This workspace has used its ${monthlyLimit.toLocaleString('en-IN')} monthly AI tokens.`,
      };
    }
  }

  // A money cap across everyone, so one runaway workspace cannot spend the
  // platform's whole month even if its own token budget is generous.
  if (limits.monthlyBudget > 0) {
    const spent = await prisma.aiUsage.aggregate({
      where: { createdAt: { gte: startOfMonth(now) } },
      _sum: { costMicro: true },
    });
    const rupees = (spent._sum.costMicro ?? 0) / MICRO;
    if (rupees >= limits.monthlyBudget) {
      return {
        allowed: false,
        reason: 'BUDGET',
        detail: `The platform's ₹${limits.monthlyBudget.toLocaleString('en-IN')} monthly AI budget is spent.`,
      };
    }
  }

  return { allowed: true };
}

/** Writes one usage row. Never throws — accounting must not break a feature. */
export async function recordUsage(
  prisma: PrismaClient,
  row: {
    tenantId: string | null;
    provider: string;
    model: string;
    feature: string;
    promptTokens?: number;
    completionTokens?: number;
    ok: boolean;
    errorCode?: string | null;
    latencyMs: number;
  },
): Promise<void> {
  try {
    const limits = await getLimits(prisma);
    const promptTokens = row.promptTokens ?? 0;
    const completionTokens = row.completionTokens ?? 0;
    await prisma.aiUsage.create({
      data: {
        tenantId: row.tenantId,
        provider: row.provider,
        model: row.model,
        feature: row.feature,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costMicro: costMicro(limits.prices, row.model, promptTokens, completionTokens),
        ok: row.ok,
        errorCode: row.errorCode ?? null,
        latencyMs: row.latencyMs,
      },
    });
  } catch (err: any) {
    console.error('[AI] could not record usage:', err?.message);
  }
}

/**
 * Real usage figures pulled from Meta, and reconciliation against our own.
 *
 * What Meta will and will not give this account:
 *
 *   analytics                 sent and delivered counts        AVAILABLE
 *   pricing_analytics VOLUME  volume by country and category   AVAILABLE
 *   pricing_analytics COST    the actual amounts               REFUSED
 *
 * The refusal is explicit and is not a permission we can apply for:
 *
 *   "COST is not shown for businesses who bill through a partner (i.e. BSP).
 *    To understand your charges, please get in touch with your partner."
 *
 * This WABA bills through a partner, so amounts have to come from the rate card
 * calibrated against the partner's invoice. Everything else — how many messages,
 * to which countries, in which categories, and how many Meta actually counted as
 * delivered — is real and comes from here.
 *
 * That distinction matters because our own counts drift from Meta's: we record a
 * message when a pricing webhook arrives, Meta bills on delivery. Reconciling the
 * two is what catches the drift, and it is the closest this account can get to
 * billing from source.
 */
import type { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { resolveAccessToken } from './credentialEncryption.js';

const API = 'https://graph.facebook.com/v21.0';

export interface MetaVolumeRow {
  country: string;
  category: string;
  volume: number;
}

export interface MetaUsage {
  wabaId: string;
  from: Date;
  to: Date;
  /** Meta's own delivery counts — the basis it bills on. */
  sent: number;
  delivered: number;
  /** Volume split by country and pricing category, straight from Meta. */
  byCountryCategory: MetaVolumeRow[];
  /** Present only if Meta ever starts returning amounts for this account. */
  costAvailable: boolean;
  costUnavailableReason?: string;
}

async function credentialsFor(prisma: PrismaClient, tenantId: string) {
  const [phone, creds] = await Promise.all([
    prisma.phoneNumber.findFirst({
      where: { tenantId },
      select: { accessToken: true, wabaId: true },
    }),
    prisma.whatsAppCredentials.findUnique({ where: { tenantId } }),
  ]);
  const token = resolveAccessToken(phone?.accessToken, creds?.accessToken);
  const wabaId = phone?.wabaId || creds?.wabaId || null;
  return { token, wabaId };
}

/**
 * Pulls Meta's usage for a window. Cost is attempted first: if Meta ever grants
 * it for this account the numbers become invoice-grade with no further work,
 * and if it refuses we record why rather than silently falling back.
 */
export async function fetchMetaUsage(
  prisma: PrismaClient,
  tenantId: string,
  from: Date,
  to: Date
): Promise<MetaUsage | { error: string }> {
  const { token, wabaId } = await credentialsFor(prisma, tenantId);
  if (!token || !wabaId) return { error: 'No connected WhatsApp account for this tenant.' };

  const start = Math.floor(from.getTime() / 1000);
  const end = Math.floor(to.getTime() / 1000);

  let costAvailable = false;
  let costUnavailableReason: string | undefined;
  let rows: MetaVolumeRow[] = [];

  // Ask for COST first. Meta answers with a specific message when it will not
  // provide it, which is worth surfacing verbatim rather than paraphrasing.
  try {
    const withCost = await axios.get(`${API}/${wabaId}`, {
      params: {
        access_token: token,
        fields: `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).metric_types(["COST","VOLUME"]).dimensions(["COUNTRY","PRICING_CATEGORY"])`,
      },
    });
    costAvailable = JSON.stringify(withCost.data).includes('"cost"');
    rows = extractRows(withCost.data);
  } catch (err: any) {
    costUnavailableReason =
      err.response?.data?.error?.error_user_msg
      || err.response?.data?.error?.message
      || err.message;

    // Volume alone is still real, so fall back to asking for just that.
    try {
      const volOnly = await axios.get(`${API}/${wabaId}`, {
        params: {
          access_token: token,
          fields: `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(COUNTRY,PRICING_CATEGORY)`,
        },
      });
      rows = extractRows(volOnly.data);
    } catch (e: any) {
      return { error: e.response?.data?.error?.message || e.message };
    }
  }

  let sent = 0;
  let delivered = 0;
  try {
    const a = await axios.get(`${API}/${wabaId}`, {
      params: { access_token: token, fields: `analytics.start(${start}).end(${end}).granularity(DAY)` },
    });
    for (const d of a.data?.analytics?.data_points || []) {
      sent += d.sent || 0;
      delivered += d.delivered || 0;
    }
  } catch {
    // Delivery counts are a cross-check, not the point — carry on without them.
  }

  return { wabaId, from, to, sent, delivered, byCountryCategory: rows, costAvailable, costUnavailableReason };
}

function extractRows(payload: any): MetaVolumeRow[] {
  const points = payload?.pricing_analytics?.data?.[0]?.data_points || [];
  const merged = new Map<string, MetaVolumeRow>();
  for (const d of points) {
    const key = `${d.country}|${d.pricing_category}`;
    const cur = merged.get(key) || { country: d.country, category: d.pricing_category, volume: 0 };
    cur.volume += d.volume || 0;
    merged.set(key, cur);
  }
  return [...merged.values()].sort((a, b) => b.volume - a.volume);
}

/**
 * Compares Meta's numbers with ours.
 *
 * We cost a message when its pricing webhook lands; Meta bills on delivery. The
 * two should be close and are not identical, and the gap is the thing worth
 * watching — it is money charged for messages Meta never billed.
 */
export async function reconcileWithMeta(
  prisma: PrismaClient,
  tenantId: string,
  from: Date,
  to: Date
) {
  const usage = await fetchMetaUsage(prisma, tenantId, from, to);
  if ('error' in usage) return { error: usage.error };

  const ours = await prisma.message.findMany({
    where: { tenantId, direction: 'OUTGOING', createdAt: { gte: from, lte: to }, metaCostUsd: { not: null } },
    select: { metaCategory: true, metaBillable: true, contact: { select: { country: true } } },
  });

  const oursByKey = new Map<string, number>();
  for (const m of ours) {
    const key = `${m.contact?.country || 'unknown'}|${(m.metaCategory || 'unknown').toUpperCase()}`;
    oursByKey.set(key, (oursByKey.get(key) || 0) + 1);
  }

  const lines = usage.byCountryCategory.map((r) => {
    const key = `${r.country}|${r.category.toUpperCase()}`;
    const oursCount = oursByKey.get(key) || 0;
    oursByKey.delete(key);
    return { country: r.country, category: r.category, metaVolume: r.volume, ourCount: oursCount, drift: oursCount - r.volume };
  });
  // Anything we counted that Meta did not report at all.
  for (const [key, count] of oursByKey) {
    const [country, category] = key.split('|');
    lines.push({ country, category, metaVolume: 0, ourCount: count, drift: count });
  }

  const metaTotal = usage.byCountryCategory.reduce((n, r) => n + r.volume, 0);
  const ourTotal = ours.length;

  return {
    window: { from, to },
    meta: {
      sent: usage.sent,
      delivered: usage.delivered,
      volume: metaTotal,
      costAvailable: usage.costAvailable,
      costUnavailableReason: usage.costUnavailableReason,
    },
    ours: { costedMessages: ourTotal, freeMessages: ours.filter((m) => m.metaBillable === false).length },
    drift: {
      messages: ourTotal - metaTotal,
      // Charging for more messages than Meta billed is the direction that costs
      // a tenant money, so it is called out rather than shown as a bare number.
      overCounted: Math.max(0, ourTotal - metaTotal),
      pct: metaTotal > 0 ? Math.round(((ourTotal - metaTotal) / metaTotal) * 1000) / 10 : null,
    },
    lines: lines.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)),
  };
}

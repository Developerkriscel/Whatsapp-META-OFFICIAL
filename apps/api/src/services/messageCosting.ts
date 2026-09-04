/**
 * Real per-message costing.
 *
 * Until now the platform tracked credits and nothing else, so three separate
 * questions had no answer: what did Meta bill us, what did we charge for it,
 * and what was the margin. The columns to hold that existed on Message and were
 * never written.
 *
 * Meta states what it billed on the status webhook, in a `pricing` block:
 *
 *   { "type": "regular", "billable": true, "category": "marketing",
 *     "pricing_model": "PMP" }
 *
 * Two things there matter and neither can be derived locally:
 *
 *  - `billable` is false for messages inside the free customer-service window
 *    and free-entry-point conversations. Charging for those overcharges the
 *    tenant, and on this account it is roughly 8% of traffic.
 *  - `category` is Meta's own classification and does not have to match the
 *    template's category. Pricing off our category rather than Meta's bills
 *    the wrong rate whenever they disagree.
 *
 * Meta reports the category but not the amount, so the amount comes from the
 * rate card, keyed on the recipient's country and Meta's category.
 */
import type { PrismaClient } from '@prisma/client';
import { creditsToUsd } from './creditService.js';

export interface MetaPricing {
  billable?: boolean;
  category?: string;
  pricing_model?: string;
  type?: string;
}

/** Meta's lowercase categories mapped to the rate card's. */
const CATEGORY_MAP: Record<string, 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE'> = {
  marketing: 'MARKETING',
  utility: 'UTILITY',
  authentication: 'AUTHENTICATION',
  service: 'SERVICE',
  referral_conversion: 'SERVICE',
};

export function normaliseCategory(metaCategory?: string): 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE' {
  return CATEGORY_MAP[(metaCategory || '').toLowerCase()] || 'UTILITY';
}

/**
 * What Meta charges us for one message, in USD.
 *
 * The rate card holds Meta's cost as credits per country and category
 * (metaMarketingCredits and friends). A non-billable message costs nothing, no
 * matter what the card says.
 */
export async function pricePairFor(
  prisma: PrismaClient,
  country: string,
  pricing: MetaPricing
): Promise<{ metaCostUsd: number; platformCostUsd: number }> {
  const free = { metaCostUsd: 0, platformCostUsd: 0 };
  if (pricing.billable === false) return free;

  const category = normaliseCategory(pricing.category);
  if (category === 'SERVICE') return free; // customer-initiated, no charge either side

  // Both sides come from the same rate row, in one lookup. An earlier version
  // read the sell price through getRateCredits, which serves an in-memory cache
  // populated at app startup -- so anything running outside the server (a
  // backfill, a script) silently got the fallback table, which holds Meta's own
  // rates. Cost and price then came out identical and every margin read 0%.
  const rate = await prisma.creditRate.findUnique({ where: { countryCode: country } })
    ?? await prisma.creditRate.findUnique({ where: { countryCode: 'OTHER' } });
  if (!rate) return free;

  const [sellCredits, costCredits] =
    category === 'MARKETING' ? [rate.marketingCredits, rate.metaMarketingCredits]
    : category === 'AUTHENTICATION' ? [rate.authCredits, rate.metaAuthCredits]
    : [rate.utilityCredits, rate.metaUtilityCredits];

  return {
    metaCostUsd: creditsToUsd(costCredits),
    platformCostUsd: creditsToUsd(sellCredits),
  };
}

/**
 * Records what a message actually cost, from Meta's own report.
 *
 * Called from the status webhook. Deliberately tolerant: costing is bookkeeping
 * and must never interfere with recording that a message was delivered.
 */
export async function recordMessageCost(
  prisma: PrismaClient,
  messageId: string,
  pricing: MetaPricing | undefined,
  country: string | null | undefined
): Promise<void> {
  if (!pricing) return;

  try {
    // Priced on Meta's category rather than the template's, so both sides of
    // the margin rest on the same basis as the bill we actually receive.
    const { metaCostUsd: metaCost, platformCostUsd: platformCost } =
      await pricePairFor(prisma, country || 'OTHER', pricing);

    await prisma.message.update({
      where: { id: messageId },
      data: {
        metaBillable: pricing.billable ?? null,
        metaCategory: pricing.category ?? null,
        metaPricingModel: pricing.pricing_model ?? null,
        metaPricingType: pricing.type ?? null,
        metaCostUsd: metaCost,
        platformCostUsd: platformCost,
      },
    });
  } catch (err: any) {
    console.error(`[costing] could not record cost for ${messageId}:`, err?.message);
  }
}

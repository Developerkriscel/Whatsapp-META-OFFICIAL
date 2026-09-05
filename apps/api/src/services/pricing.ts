/**
 * Checkout pricing: what a purchase costs, itemised.
 *
 * The credit packs were hardcoded in the frontend with a platform fee and GST
 * baked into a single constant, at a price that had drifted to 11x the rate the
 * billing engine actually charges those credits at. Nobody could see that,
 * because nothing put the two numbers side by side.
 *
 * Packs, fees and their order now live in the database, and this builds the
 * breakdown from them — the way a delivery app itemises a bill, so a buyer can
 * see what each line is and an operator can add or change one without a deploy.
 *
 * Money is handled in minor units (paise) throughout. Fractions of a rupee do
 * not survive floating point addition intact, and a checkout total that fails to
 * match the sum of its own lines is not something to debug later.
 */
import type { PrismaClient } from '@prisma/client';

export interface FeeLine {
  code: string;
  name: string;
  description?: string | null;
  /** PERCENT fees carry the rate they were computed at, for the breakdown. */
  rate?: string;
  /** What a percent fee was charged against, so the line can explain itself. */
  basis?: string;
  amountMinor: number;
  visible: boolean;
}

export interface PriceBreakdown {
  currency: string;
  baseMinor: number;
  fees: FeeLine[];
  totalMinor: number;
  /** Fees the operator marked hidden still count toward the total. */
  hiddenFeesMinor: number;
}

/**
 * Applies the active fees to a base amount.
 *
 * Fees run in sortOrder, and a percent fee states what it is a percent of:
 *
 *   BASE            the package price alone
 *   SUBTOTAL        the price plus every fee charged before it
 *   PRECEDING_FEES  only those fees — tax on a service charge
 *
 * The last one is what this app actually does: GST is charged on the platform
 * fee, not on the purchase. A boolean "compounds" could not say that, and
 * assuming SUBTOTAL would have turned a Rs 0.30 tax line into Rs 15.10.
 */
export async function priceWithFees(
  prisma: PrismaClient,
  baseMinor: number,
  appliesTo: 'CREDIT_PURCHASE' | 'SUBSCRIPTION',
  currency = 'INR'
): Promise<PriceBreakdown> {
  const fees = await prisma.platformFee.findMany({
    where: { isActive: true, appliesTo: { in: [appliesTo, 'ALL'] } },
    orderBy: { sortOrder: 'asc' },
  });

  const lines: FeeLine[] = [];
  let running = baseMinor;

  let feesSoFar = 0;

  for (const f of fees) {
    const applyTo =
      f.basis === 'SUBTOTAL' ? running
      : f.basis === 'PRECEDING_FEES' ? feesSoFar
      : baseMinor;

    const amount = f.type === 'PERCENT'
      ? Math.round((applyTo * f.value) / 10000)  // value is basis points
      : f.value;

    if (amount === 0) continue;

    lines.push({
      code: f.code,
      name: f.name,
      description: f.description,
      rate: f.type === 'PERCENT' ? `${(f.value / 100).toFixed(2)}%` : undefined,
      amountMinor: amount,
      basis: f.basis,
      visible: f.isVisible,
    });
    running += amount;
    feesSoFar += amount;
  }

  return {
    currency,
    baseMinor,
    fees: lines,
    totalMinor: running,
    hiddenFeesMinor: lines.filter((l) => !l.visible).reduce((n, l) => n + l.amountMinor, 0),
  };
}

/**
 * What a pack is worth in messages, from the rate card that will actually bill
 * them — not a hardcoded divisor.
 *
 * The old page claimed "~5 messages" for 1,000 credits by dividing by a
 * constant 200. The real figure depends on country and category and is the
 * number a buyer is actually deciding on.
 */
export async function messagesPerCredits(
  prisma: PrismaClient,
  credits: number,
  countryCode = 'IN',
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' = 'MARKETING'
): Promise<{ messages: number; perMessageCredits: number; country: string }> {
  const rate = await prisma.creditRate.findUnique({ where: { countryCode } })
    ?? await prisma.creditRate.findUnique({ where: { countryCode: 'OTHER' } });

  const perMessage =
    !rate ? 0
    : category === 'MARKETING' ? rate.marketingCredits
    : category === 'AUTHENTICATION' ? rate.authCredits
    : rate.utilityCredits;

  return {
    messages: perMessage > 0 ? Math.floor(credits / perMessage) : 0,
    perMessageCredits: perMessage,
    country: rate?.countryCode ?? countryCode,
  };
}

/**
 * A pack priced against the rate card, with the fee breakdown attached.
 *
 * `valueRatio` is the check that was missing: what a buyer pays per credit
 * against what the billing engine consumes them at. At 1.0 the two agree; the
 * Starter pack was at 11.2 and nothing surfaced it.
 */
export async function quotePackage(
  prisma: PrismaClient,
  pkg: { credits: number; priceMinor: number; currency: string },
  countryCode = 'IN'
) {
  const breakdown = await priceWithFees(prisma, pkg.priceMinor, 'CREDIT_PURCHASE', pkg.currency);
  const usage = await messagesPerCredits(prisma, pkg.credits, countryCode);

  const fxRow = await prisma.platformSetting.findUnique({ where: { key: 'fx_usd_rate' } });
  const fx = Number(fxRow?.value ?? 88.5);
  // Read the peg rather than assuming 10,000. Hardcoding it here meant the
  // value ratio — the one number that says whether a pack agrees with the rate
  // card — did not move when the peg was changed to fix exactly that.
  const { getCreditsPerUsd } = await import('./creditService.js');
  const creditWorthMinor = (1 / getCreditsPerUsd()) * fx * 100;
  const paidPerCreditMinor = pkg.credits > 0 ? breakdown.totalMinor / pkg.credits : 0;

  return {
    ...breakdown,
    credits: pkg.credits,
    messages: usage.messages,
    perMessageCredits: usage.perMessageCredits,
    perMessageMinor: usage.messages > 0 ? Math.round(breakdown.totalMinor / usage.messages) : null,
    valueRatio: creditWorthMinor > 0 ? Math.round((paidPerCreditMinor / creditWorthMinor) * 100) / 100 : null,
  };
}

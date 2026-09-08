/**
 * Rupee-native billing.
 *
 * The old model had three layers between Meta's price and the tenant's
 * balance: Meta charges dollars, we stored a "credit" worth 1/10,000th of a
 * dollar, and we displayed rupees via an exchange rate. Every rate on the card
 * was a credit count whose meaning depended on a peg stored somewhere else, so
 * a wrong peg silently restated Meta's own costs — at one point the panel
 * reported Meta charging Rs 9.48 for a message Meta charges Rs 0.87 for.
 *
 * This replaces all of that with one unit: the paisa. Meta's official cost for
 * a country and category is stored in paise, the tenant is charged that plus a
 * margin percentage, and the balance is paise. There is no peg, no exchange
 * rate in the pricing path, and nothing to keep in sync — the number stored is
 * the number charged.
 *
 * The integer ledger underneath is unchanged, so reservations, refunds and
 * their atomicity all still hold. What changed is what one unit means.
 */
import type { PrismaClient } from '@prisma/client';

export type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SESSION';

/** Paise per rupee. Balances, rates and prices are all integers of this unit. */
export const PAISE = 100;

export const DEFAULT_MARGIN_PERCENT = 30;

/** Home market. Everything else falls back to it until its rates are entered. */
export const HOME_COUNTRY = 'IN';

let marginCache: number | null = null;
let rateCache = new Map<string, Record<Category, number>>();
let cacheLoadedAt: Date | null = null;

/** Rupees from paise, for display and API responses. */
export function toRupees(paise: number): number {
  return Math.round(paise) / PAISE;
}

/** Paise from rupees, rounded to the nearest whole paisa. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * PAISE);
}

export function formatRupees(paise: number): string {
  return '₹' + toRupees(paise).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Loads Meta's costs and the margin into memory.
 *
 * Called at boot and after any change from the panel. Pricing runs on every
 * message, so it cannot afford a query per send.
 */
export async function refreshBillingCache(prisma: PrismaClient): Promise<number> {
  const [marginRow, rates] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: 'margin_percent' } }),
    prisma.creditRate.findMany(),
  ]);

  const parsed = Number(marginRow?.value);
  marginCache = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MARGIN_PERCENT;

  const next = new Map<string, Record<Category, number>>();
  for (const r of rates as any[]) {
    next.set(String(r.countryCode).toUpperCase(), {
      MARKETING: r.metaMarketingCredits ?? 0,
      UTILITY: r.metaUtilityCredits ?? 0,
      AUTHENTICATION: r.metaAuthCredits ?? 0,
      SESSION: 0,
    });
  }
  rateCache = next;
  cacheLoadedAt = new Date();
  return next.size;
}

export function getBillingCacheStatus(): { countries: number; margin: number | null; loadedAt: Date | null } {
  return { countries: rateCache.size, margin: marginCache, loadedAt: cacheLoadedAt };
}

export function getMarginPercent(): number {
  return marginCache ?? DEFAULT_MARGIN_PERCENT;
}

/**
 * What Meta charges us for one message, in paise.
 *
 * A country we have no rates for falls back to the home market rather than to
 * zero — charging nothing for a message Meta bills for is the more expensive
 * mistake.
 */
export function metaCostPaise(country: string | null | undefined, category: Category): number {
  const cc = String(country || HOME_COUNTRY).toUpperCase();
  const row = rateCache.get(cc) || rateCache.get(HOME_COUNTRY);
  if (!row) return 0;
  return row[category] ?? 0;
}

/**
 * What the tenant pays for one message, in paise: Meta's cost plus the margin.
 *
 * Rounded up, so the margin is never eroded to nothing by rounding on a cheap
 * category — a utility message at 12 paise and 30% is 15.6, and billing 15
 * would quietly halve the margin on the highest-volume category.
 */
export function chargePaise(country: string | null | undefined, category: Category): number {
  const cost = metaCostPaise(country, category);
  if (cost <= 0) return 0;
  return Math.ceil(cost * (1 + getMarginPercent() / 100));
}

/** Both sides of one message, for anything that needs to show the split. */
export function priceMessage(country: string | null | undefined, category: Category): {
  metaPaise: number;
  chargePaise: number;
  marginPaise: number;
  marginPercent: number;
} {
  const meta = metaCostPaise(country, category);
  const charge = chargePaise(country, category);
  return {
    metaPaise: meta,
    chargePaise: charge,
    marginPaise: charge - meta,
    marginPercent: getMarginPercent(),
  };
}

/** Persists the margin and reloads the cache so it takes effect immediately. */
export async function setMarginPercent(prisma: PrismaClient, percent: number): Promise<number> {
  await prisma.platformSetting.upsert({
    where: { key: 'margin_percent' },
    create: { key: 'margin_percent', value: String(percent) },
    update: { value: String(percent) },
  });
  await refreshBillingCache(prisma);
  return getMarginPercent();
}

/** Every country we hold Meta costs for, priced at the current margin. */
export function ratesTable(): Array<{
  countryCode: string;
  marketing: ReturnType<typeof priceMessage>;
  utility: ReturnType<typeof priceMessage>;
  authentication: ReturnType<typeof priceMessage>;
}> {
  return [...rateCache.keys()].sort().map((cc) => ({
    countryCode: cc,
    marketing: priceMessage(cc, 'MARKETING'),
    utility: priceMessage(cc, 'UTILITY'),
    authentication: priceMessage(cc, 'AUTHENTICATION'),
  }));
}

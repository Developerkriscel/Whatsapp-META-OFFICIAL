/**
 * One place that decides how money is written in this app.
 *
 * Before this, several pages each carried their own conversion table and their
 * own idea of the symbol. CreditsPage converted USD at 83.85 while the rate
 * card used 88.5, so the same spend rendered as two different numbers depending
 * on which screen you were looking at, and neither could be corrected without a
 * deploy.
 *
 * Everything now reads one platform setting. Amounts are stored in USD, because
 * that is the unit Meta's rate card and the credit system share (10,000 credits
 * = $1), and converted only for display.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * Only a last-resort fallback for the seconds before /settings/currency
 * answers. It used to be the value every conversion actually used, which meant
 * the superadmin panel could change the peg and no page that spent credits
 * would agree with it.
 */
export const CREDITS_PER_USD = 10000;

export interface CurrencyContext {
  currency: string;
  symbol: string;
  fxRate: number;
  fxSource: 'configured' | 'default';
  fxUpdatedAt: string | null;
  /** Configured peg, no longer assumed. */
  creditsPerUsd: number;
  /** What one credit is worth in `currency`. The only number needed to price a balance. */
  creditWorth: number;
}

/** Used until the setting loads, so a page never flashes the wrong symbol. */
const FALLBACK: CurrencyContext = {
  currency: 'INR',
  symbol: '₹',
  fxRate: 88.5,
  fxSource: 'default',
  fxUpdatedAt: null,
  creditsPerUsd: CREDITS_PER_USD,
  creditWorth: 88.5 / CREDITS_PER_USD,
};

/**
 * The platform's reporting currency. Cached for the session — it changes about
 * as often as someone edits a setting, so refetching per page is waste.
 */
export function useCurrency(): CurrencyContext {
  const { data } = useQuery({
    queryKey: ['platform-currency'],
    queryFn: async () => (await api.get('/settings/currency')).data?.data as CurrencyContext,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  return data ?? FALLBACK;
}

/** Indian digit grouping (1,23,456) when showing rupees; Western otherwise. */
function localeFor(currency: string): string {
  return currency === 'INR' ? 'en-IN' : 'en-US';
}

/** A total: two decimals, grouped. `₹1,23,456.78` */
export function formatMoney(usd: number, ctx: CurrencyContext, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2;
  const amount = usd * ctx.fxRate;
  return ctx.symbol + amount.toLocaleString(localeFor(ctx.currency), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A single message's price. One message costs well under a rupee, so two
 * decimals would round most rates to the same value and make a rate card
 * useless for comparing countries.
 */
export function formatUnitMoney(usd: number, ctx: CurrencyContext): string {
  const amount = usd * ctx.fxRate;
  const decimals = Math.abs(amount) < 1 ? 4 : 3;
  return ctx.symbol + amount.toLocaleString(localeFor(ctx.currency), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Credits are the stored balance unit; this is what they are worth.
 *
 * Goes straight from credits to the reporting currency using the configured
 * per-credit value. It used to divide by a hardcoded 10,000 to reach dollars
 * and then multiply back up by the exchange rate — two conversions that could
 * disagree with the panel that set them.
 */
export function creditsToMoney(credits: number, ctx: CurrencyContext, unit = false): string {
  const amount = credits * ctx.creditWorth;
  const decimals = unit ? (Math.abs(amount) < 1 ? 4 : 3) : 2;
  return ctx.symbol + amount.toLocaleString(localeFor(ctx.currency), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Plain credit count with grouping, for where the balance itself is the point. */
export function formatCredits(credits: number): string {
  return credits.toLocaleString('en-IN');
}

/**
 * Balance shown the way a person actually reads it: the money first, with the
 * credit count as the secondary detail rather than the headline.
 */
export function formatBalance(credits: number, ctx: CurrencyContext): { money: string; credits: string } {
  return { money: creditsToMoney(credits, ctx), credits: formatCredits(credits) };
}

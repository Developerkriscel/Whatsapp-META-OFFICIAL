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

export const CREDITS_PER_USD = 10000;

export interface CurrencyContext {
  currency: string;
  symbol: string;
  fxRate: number;
  fxSource: 'configured' | 'default';
  fxUpdatedAt: string | null;
}

/** Used until the setting loads, so a page never flashes the wrong symbol. */
const FALLBACK: CurrencyContext = {
  currency: 'INR',
  symbol: '₹',
  fxRate: 88.5,
  fxSource: 'default',
  fxUpdatedAt: null,
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

/** Credits are the stored balance unit; this is what they are worth. */
export function creditsToMoney(credits: number, ctx: CurrencyContext, unit = false): string {
  const usd = credits / CREDITS_PER_USD;
  return unit ? formatUnitMoney(usd, ctx) : formatMoney(usd, ctx);
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

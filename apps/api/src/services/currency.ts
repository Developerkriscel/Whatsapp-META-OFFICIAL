/**
 * Reporting currency.
 *
 * Costs are stored in USD because that is the unit Meta's rate card and our
 * credit system are both denominated in (10,000 credits = $1). But this is an
 * Indian business billing Indian recipients, and reading spend in dollars means
 * converting in your head every time.
 *
 * So storage stays USD and presentation is converted. The rate is a platform
 * setting rather than a constant, because it moves and because nobody should
 * need a deploy to correct it.
 *
 * Meta's own billing currency cannot be read back: the WABA `currency` field
 * returns "requires that the Business that owns this App is a Business Solution
 * Provider", and pricing_analytics returns volumes without amounts. Until BSP
 * access exists, the configured rate is the honest basis, and every response
 * says which rate it used so the number can be checked.
 */
import type { PrismaClient } from '@prisma/client';

export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_FX: Record<string, number> = {
  INR: 88.5,
  USD: 1,
};

const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SGD: 'S$',
};

export interface Money {
  /** The stored basis, always USD. */
  usd: number;
  /** Converted into the reporting currency. */
  amount: number;
  currency: string;
  symbol: string;
}

export interface CurrencyContext {
  currency: string;
  symbol: string;
  fxRate: number;
  /** Where the rate came from, so a stale default is visible rather than implied. */
  fxSource: 'configured' | 'default';
  fxUpdatedAt: Date | null;
}

/** Reads the reporting currency and its rate, falling back to sane defaults. */
export async function getCurrencyContext(prisma: PrismaClient): Promise<CurrencyContext> {
  let currency = DEFAULT_CURRENCY;
  let fxRate = DEFAULT_FX[DEFAULT_CURRENCY];
  let fxSource: 'configured' | 'default' = 'default';
  let fxUpdatedAt: Date | null = null;

  try {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: ['display_currency', 'fx_usd_rate'] } },
    });
    const cur = rows.find((r) => r.key === 'display_currency');
    const fx = rows.find((r) => r.key === 'fx_usd_rate');

    if (cur?.value) currency = cur.value.toUpperCase();
    if (fx?.value && Number.isFinite(Number(fx.value)) && Number(fx.value) > 0) {
      fxRate = Number(fx.value);
      fxSource = 'configured';
      fxUpdatedAt = fx.updatedAt;
    } else {
      fxRate = DEFAULT_FX[currency] ?? 1;
    }
  } catch {
    // Settings table missing or unreadable — defaults are still correct enough
    // to render a page, and fxSource says the rate was not configured.
  }

  return { currency, symbol: SYMBOLS[currency] || currency + ' ', fxRate, fxSource, fxUpdatedAt };
}

/** Converts a USD amount for display, keeping the USD basis alongside it. */
export function toMoney(usd: number, ctx: CurrencyContext): Money {
  const amount = usd * ctx.fxRate;
  return {
    usd: Math.round(usd * 1000000) / 1000000,
    // Two decimals for totals; sub-paisa precision is noise at this level.
    amount: Math.round(amount * 100) / 100,
    currency: ctx.currency,
    symbol: ctx.symbol,
  };
}

/** Per-message amounts need more precision — a single message costs under a rupee. */
export function toUnitMoney(usd: number, ctx: CurrencyContext): Money {
  const amount = usd * ctx.fxRate;
  return {
    usd: Math.round(usd * 1000000) / 1000000,
    amount: Math.round(amount * 10000) / 10000,
    currency: ctx.currency,
    symbol: ctx.symbol,
  };
}

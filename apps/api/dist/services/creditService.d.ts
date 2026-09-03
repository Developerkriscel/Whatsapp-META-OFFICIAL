/**
 * Credit Service — WhatsApp Business API Cost Management
 *
 * Rates match exact Meta WhatsApp Business Platform pricing
 * Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
 * Updated: July 2026
 *
 * Credit = $0.0001 (1 cent = 100 credits, 1 dollar = 10,000 credits)
 * This gives us 4 decimal precision matching exact Meta USD rates.
 *
 * Message Categories:
 * - MARKETING: Promotional content, offers, newsletters (highest cost)
 * - UTILITY: Order confirmations, shipping updates, appointment reminders
 * - AUTHENTICATION: OTPs, login verification, security codes
 * - SESSION: Customer-initiated replies within 24h window (FREE)
 *
 * Key Meta Policy:
 * - Free tier 1: Non-template replies within 24h CSW = FREE
 * - Free tier 2: Utility templates within open CSW = FREE
 * - Free tier 3: 72h free entry window (from Click-to-WhatsApp ads) = ALL categories FREE
 */
import { PrismaClient } from '@prisma/client';
export declare const META_RATES: Record<string, {
    marketing: number;
    utility: number;
    auth: number;
    session: number;
    currency: string;
    billingCurrency: string;
}>;
export declare const COUNTRY_NAMES: Record<string, string>;
export type MessageCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SESSION';
export declare const CATEGORY_LABELS: Record<MessageCategory, string>;
export declare const CATEGORY_DESCRIPTIONS: Record<MessageCategory, string>;
export declare const DEFAULT_COUNTRY = "IN";
export declare const DEFAULT_CURRENCY = "INR";
export declare const DEFAULT_LANGUAGE = "en";
/**
 * Get default country code
 */
export declare function getDefaultCountry(): string;
/**
 * Get default currency for a tenant
 */
export declare function getDefaultCurrency(): string;
export declare function refreshRateCache(prisma: PrismaClient): Promise<number>;
export declare function getRateCacheStatus(): {
    countries: number;
    loadedAt: Date | null;
};
/**
 * Credits charged for one message to `country` in `category`.
 *
 * Prefers the configured rate for that country, then the configured default
 * country, then Meta's published list price. Previously read only the hardcoded
 * META_RATES table, which meant the rates screen in the superadmin panel edited
 * rows that nothing consulted.
 */
export declare function getRateCredits(country: string, category: MessageCategory): number;
/**
 * Get rate in USD for a country + category
 */
export declare function getRateUsd(country: string, category: MessageCategory): number;
/**
 * Convert credits to USD
 * 10,000 credits = $1.00
 */
export declare function creditsToUsd(credits: number): number;
/**
 * Convert USD to credits
 */
export declare function usdToCredits(usd: number): number;
/**
 * Format USD for display
 */
export declare function formatUsd(cents: number): string;
/**
 * Get cost description for display
 */
export declare function getCostDescription(countryCode: string, category: MessageCategory): string;
/**
 * Check if a message is free (session/customer service reply)
 */
export declare function isFreeMessage(category: MessageCategory): boolean;
export interface MessageCost {
    credits: number;
    usd: number;
    category: MessageCategory;
    countryCode: string;
    isFree: boolean;
}
export declare function calculateMessageCost(_prisma: PrismaClient, _tenantId: string, country: string, category: MessageCategory): Promise<MessageCost>;
export declare function deductCredits(prisma: PrismaClient, tenantId: string, amount: number, referenceId: string, referenceType: string, description?: string): Promise<{
    success: boolean;
    balanceAfter: number;
    error?: string;
}>;
export declare function maybeAutoRecharge(prisma: PrismaClient, tenantId: string, balanceAfter: number): Promise<void>;
/**
 * Takes credits for a whole batch of messages in one transaction.
 *
 * Charging per message meant one database transaction per recipient. A campaign
 * batch dispatched in parallel then opened that many transactions at once and
 * exhausted the pool, which capped safe concurrency at about three sends and
 * made bulk campaigns unusably slow. One reservation per batch removes that
 * ceiling entirely — the transaction count stops scaling with recipients.
 *
 * Partial reservation is deliberate: a tenant with enough credits for 800 of
 * 1,000 recipients gets 800 messages sent and a clear shortfall, rather than the
 * whole campaign refused or — worse — 800 sent free because each per-message
 * check was ignored.
 */
export declare function reserveCreditsForBatch(prisma: PrismaClient, tenantId: string, unitCosts: number[], referenceId: string, description?: string): Promise<{
    reservedFor: number;
    reservedAmount: number;
    shortfall: number;
    balanceAfter: number;
}>;
/**
 * Returns the unused part of a batch reservation — the recipients Meta refused.
 * One transaction for the batch, matching how the credits were taken.
 */
export declare function releaseUnusedReservation(prisma: PrismaClient, tenantId: string, amount: number, referenceId: string, description?: string): Promise<void>;
/**
 * Returns credits charged for a message the provider then refused. Named
 * separately from addCredits so the ledger reads honestly — a refund is not a
 * purchase, and the two should be distinguishable when reconciling.
 */
export declare function refundCredits(prisma: PrismaClient, tenantId: string, amount: number, referenceId?: string, _referenceType?: string, description?: string): Promise<{
    success: boolean;
    balanceAfter: number;
}>;
export declare function addCredits(prisma: PrismaClient, tenantId: string, amount: number, type: 'PURCHASE' | 'BONUS' | 'REFUND' | 'ADJUSTMENT', referenceId?: string, description?: string): Promise<{
    success: boolean;
    balanceAfter: number;
}>;
export declare function getTenantCreditInfo(prisma: PrismaClient, tenantId: string): Promise<{
    balance: number;
    totalPurchased: number;
    totalUsed: number;
    balanceUsd: string;
    transactions: any[];
} | null>;
export declare function recordMessageCredit(prisma: PrismaClient, data: {
    tenantId: string;
    messageId: string;
    country: string;
    category: MessageCategory;
    cost: number;
}): Promise<void>;
/**
 * Default markup applied when seeding a country for the first time.
 *
 * 1.0 would mean reselling at exactly Meta's price and earning nothing on
 * messages. 1.30 is a starting point, not a recommendation — the whole purpose
 * of moving rates into the database is that this becomes the operator's call,
 * per country and category, from the panel.
 */
export declare const DEFAULT_MARKUP = 1.3;
/**
 * Populates rates from Meta's published prices, recording Meta's cost alongside
 * the sell price so margin stays visible after the fact.
 *
 * Only fills in countries that are missing, so re-running never overwrites a
 * price an operator has set by hand.
 */
export declare function seedCreditRates(prisma: PrismaClient, markup?: number): Promise<number>;
/**
 * Get all available country codes
 */
export declare function getAvailableCountries(): string[];
/**
 * Detect country from phone number
 * Returns country code or 'US' as fallback
 */
export declare function detectCountryFromPhone(phoneNumber: string): string;
//# sourceMappingURL=creditService.d.ts.map
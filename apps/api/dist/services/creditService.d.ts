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
/**
 * Get credit cost for a country + category
 * Returns credits (where 1 credit = $0.0001)
 * Falls back to India (IN) if country not found
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
export declare function seedCreditRates(prisma: PrismaClient): Promise<void>;
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
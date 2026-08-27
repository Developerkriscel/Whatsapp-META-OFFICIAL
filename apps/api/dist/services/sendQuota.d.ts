import { PrismaClient } from '@prisma/client';
/**
 * Meta's messaging tiers. The number is a cap on how many *unique customers*
 * a phone number may message in a rolling 24h window — not a message count, so
 * ten messages to one customer consume one unit, not ten.
 */
export declare const TIER_LIMITS: Record<string, number | null>;
export interface TierUsage {
    tier: string | null;
    /** null when the tier is uncapped or unknown. */
    limit: number | null;
    uniqueCustomers24h: number;
    /** null when there is no cap to remain under. */
    remaining: number | null;
}
/**
 * How much of Meta's 24h unique-customer allowance this number has used.
 *
 * Counts distinct contacts we sent to and Meta accepted — a rejected send never
 * reached a customer and doesn't consume allowance.
 */
export declare function getTierUsage(prisma: PrismaClient, phoneNumberId: string): Promise<TierUsage>;
/**
 * Whether this number can still start a conversation with `newCustomers` people
 * it hasn't messaged in the last 24h. Used to warn at campaign creation rather
 * than letting a campaign discover the cap part-way through its recipient list.
 */
export declare function checkTierCapacity(prisma: PrismaClient, phoneNumberId: string, newCustomers: number): Promise<{
    withinTier: boolean;
    usage: TierUsage;
    message?: string;
}>;
export interface SendSlot {
    allowed: boolean;
    todaySentCount: number;
    dailySentLimit: number;
    /** Set when allowed is false, suitable for surfacing to the user. */
    reason?: string;
}
export declare function reserveSendSlot(prisma: PrismaClient, phoneNumberId: string): Promise<SendSlot>;
/**
 * Returns a reserved slot after a failed send. Floors at zero so a release
 * that races a window reset can't drive the counter negative.
 */
export declare function releaseSendSlot(prisma: PrismaClient, phoneNumberId: string): Promise<void>;
//# sourceMappingURL=sendQuota.d.ts.map
import { PrismaClient } from '@prisma/client';
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
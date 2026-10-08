import { FastifyInstance } from 'fastify';
/**
 * Register tenant routes
 */
export declare function registerTenantRoutes(app: FastifyInstance): Promise<void>;
export declare function createNotification(prisma: any, data: {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    message: string;
    referenceType?: string;
    referenceId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    data?: any;
}): Promise<void>;
/**
 * Removes a campaign's uploaded header media once it can no longer be needed.
 * Meta fetches the file during the send, so this must run only after the
 * campaign reaches a terminal state — never mid-send.
 */
/**
 * Deletes campaign media once Meta can no longer need it.
 *
 * "No longer need it" is not "the campaign finished". Meta downloads a linked
 * file after accepting the message, and retries undelivered messages for up to
 * 24 hours, so the file has to outlive both. This runs on a timer and only
 * removes media whose campaign finished more than the grace period ago and has
 * no messages still awaiting a delivery verdict.
 */
export declare function sweepCampaignMedia(app: FastifyInstance): Promise<number>;
/**
 * Recomputes a campaign's counters from its message rows.
 *
 * The counters used to be maintained by two writers that did not know about
 * each other: the send loop wrote absolute totals for sent and failed, and the
 * status webhook incremented delivered/read/failed by one. A message that was
 * handed to Meta and later failed was therefore counted in both, which is how
 * campaign 01-10-2026 came to claim 250 sent and 6 failed out of 250
 * recipients while its rows actually read 232 sent and 18 failed.
 *
 * Nothing needs to be counted twice, because the message rows already record
 * every transition. These columns are a cache of that, so they are derived
 * from it rather than accumulated alongside it.
 *
 * The categories are cumulative, which is what the words mean to someone
 * reading a campaign card: a message that was read was also delivered, and one
 * that was delivered was also sent. That also keeps sent + failed equal to the
 * number of recipients actually attempted, which the old arithmetic did not.
 */
export declare function recountCampaign(app: FastifyInstance, campaignId: string): Promise<{
    sent: number;
    delivered: number;
    read: number;
    failed: number;
}>;
export declare function sendCampaignMessages(app: FastifyInstance, campaignId: string, tenantId: string): Promise<void>;
//# sourceMappingURL=tenant.d.ts.map
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
export declare function sendCampaignMessages(app: FastifyInstance, campaignId: string, tenantId: string): Promise<void>;
//# sourceMappingURL=tenant.d.ts.map
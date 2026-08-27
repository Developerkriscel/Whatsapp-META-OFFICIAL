import { FastifyInstance } from 'fastify';
/**
 * Register webhook routes
 */
export declare function registerWebhookRoutes(app: FastifyInstance): Promise<void>;
export declare function processWhatsAppWebhook(app: FastifyInstance, body: any): Promise<void>;
//# sourceMappingURL=webhooks.d.ts.map
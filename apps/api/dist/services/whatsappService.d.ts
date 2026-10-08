import { FastifyInstance } from 'fastify';
export interface DispatchMessageParams {
    app: FastifyInstance;
    messageId: string;
    tenantId: string;
    contactPhone: string;
    phoneNumberId: string;
    body: string;
    type?: 'text' | 'template' | 'media';
    media?: {
        kind: 'image' | 'video' | 'document' | 'audio';
        link: string;
        caption?: string;
        filename?: string;
    };
    template?: {
        name: string;
        language: string;
        components: any[];
    };
}
/**
 * Dispatches an outbound WhatsApp message to Meta Cloud API.
 * Uses tenant credentials if available, falling back to server environment configuration.
 * Updates message status in database to SENT or FAILED.
 */
export declare function dispatchOutboundMessage(params: DispatchMessageParams): Promise<any>;
//# sourceMappingURL=whatsappService.d.ts.map
/**
 * Automation / Chatbot Builder Routes
 * Implements: Triggers → Conditions → Actions → Delays → Human Handoff
 */
import { FastifyInstance } from 'fastify';
export declare function registerAutomationRoutes(app: FastifyInstance): Promise<void>;
/**
 * Finds the active flow for a conversation's phone number and runs it from the
 * start. Shared by the manual POST /automation/trigger route and the inbound
 * webhook handler (webhooks.ts), which previously never triggered flows at
 * all — a connected bot flow could never actually greet or respond to a real
 * incoming WhatsApp message.
 */
export declare function triggerFlowForConversation(app: FastifyInstance, tenantId: string, conversationId: string, opts?: {
    keyword?: string;
}): Promise<{
    success: boolean;
    data?: any;
    error?: any;
}>;
//# sourceMappingURL=automation.d.ts.map
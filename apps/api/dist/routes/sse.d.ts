/**
 * Real-time Inbox via Server-Sent Events (SSE)
 * Delivers live message updates, status changes, and notifications
 */
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
export declare function registerSSERoutes(app: FastifyInstance): Promise<void>;
/**
 * Broadcast event to all SSE connections for a tenant
 */
export declare function broadcastToTenant(tenantId: string, event: {
    event: string;
    data: any;
}): void;
/**
 * Broadcast to specific conversation participants
 */
export declare function broadcastToConversation(prisma: PrismaClient, conversationId: string, event: {
    event: string;
    data: any;
}): void;
/**
 * Broadcast new message event
 */
export declare function broadcastNewMessage(tenantId: string, message: {
    id: string;
    conversationId: string;
    content: string;
    direction: 'INCOMING' | 'OUTGOING';
    senderName?: string;
    timestamp: string;
}): void;
/**
 * Broadcast message status update
 */
export declare function broadcastMessageStatus(tenantId: string, messageId: string, conversationId: string, status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', error?: string): void;
/**
 * Broadcast unread count update
 */
export declare function broadcastUnreadCount(tenantId: string, conversationId: string, count: number): void;
/**
 * Get active connection count (for monitoring)
 */
export declare function getActiveConnectionCount(): number;
//# sourceMappingURL=sse.d.ts.map
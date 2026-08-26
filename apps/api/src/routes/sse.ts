/**
 * Real-time Inbox via Server-Sent Events (SSE)
 * Delivers live message updates, status changes, and notifications
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

// Store active SSE connections per tenant
const activeConnections = new Map<string, Set<FastifyReply>>();

export async function registerSSERoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /sse/inbox - Subscribe to real-time inbox updates
   * Returns SSE stream with events:
   * - new_message: New incoming/outgoing message
   * - message_status: Message status changed (sent, delivered, read, failed)
   * - conversation_updated: Conversation metadata changed
   * - unread_count: Unread count changed
   * - typing: Agent is typing
   */
  app.get('/sse/inbox', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const tenantId = request.authUser.tenantId;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Add to active connections
    if (!activeConnections.has(tenantId)) {
      activeConnections.set(tenantId, new Set());
    }
    activeConnections.get(tenantId)!.add(reply);

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ tenantId, timestamp: new Date().toISOString() })}\n\n`);

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      if (reply.raw.writable) {
        reply.raw.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
      }
    }, 30000);

    // Handle client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      const connections = activeConnections.get(tenantId);
      if (connections) {
        connections.delete(reply);
        if (connections.size === 0) {
          activeConnections.delete(tenantId);
        }
      }
    });
  });

  /**
   * POST /sse/typing - Send typing indicator to conversation
   */
  app.post('/sse/typing', async (request, reply) => {
    if (!request.authUser?.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string' },
        isTyping: { type: 'boolean' },
      },
      required: ['conversationId', 'isTyping'],
    };

    const { conversationId, isTyping } = request.body as { conversationId: string; isTyping: boolean };

    // Broadcast to all connections for this tenant
    broadcastToTenant(request.authUser.tenantId, {
      event: 'typing',
      data: {
        conversationId,
        userId: request.authUser.id,
        isTyping,
        timestamp: new Date().toISOString(),
      },
    });

    return { success: true };
  });

  /**
   * POST /sse/ping - Keep connection alive (client can call periodically)
   */
  app.post('/sse/ping', async (request, reply) => {
    return { success: true, timestamp: new Date().toISOString() };
  });
}

/**
 * Broadcast event to all SSE connections for a tenant
 */
export function broadcastToTenant(tenantId: string, event: { event: string; data: any }): void {
  const connections = activeConnections.get(tenantId);
  if (!connections) return;

  const message = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;

  for (const reply of connections) {
    if (reply.raw.writable) {
      try {
        reply.raw.write(message);
      } catch (error) {
        // Connection might be closed
        connections.delete(reply);
      }
    }
  }
}

/**
 * Broadcast to specific conversation participants
 */
export function broadcastToConversation(
  prisma: PrismaClient,
  conversationId: string,
  event: { event: string; data: any }
): void {
  // Get conversation's tenant
  prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { tenantId: true },
  }).then(conversation => {
    if (conversation) {
      broadcastToTenant(conversation.tenantId, event);
    }
  }).catch(() => {
    // Ignore errors
  });
}

/**
 * Broadcast new message event
 */
export function broadcastNewMessage(
  tenantId: string,
  message: {
    id: string;
    conversationId: string;
    content: string;
    direction: 'INCOMING' | 'OUTGOING';
    senderName?: string;
    timestamp: string;
  }
): void {
  broadcastToTenant(tenantId, {
    event: 'new_message',
    data: message,
  });

  // Also broadcast conversation update
  broadcastToTenant(tenantId, {
    event: 'conversation_updated',
    data: {
      id: message.conversationId,
      lastMessage: message.content,
      lastMessageAt: message.timestamp,
      hasUnread: true,
    },
  });
}

/**
 * Broadcast message status update
 */
export function broadcastMessageStatus(
  tenantId: string,
  messageId: string,
  conversationId: string,
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
  error?: string
): void {
  broadcastToTenant(tenantId, {
    event: 'message_status',
    data: {
      messageId,
      conversationId,
      status,
      error,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Broadcast unread count update
 */
export function broadcastUnreadCount(
  tenantId: string,
  conversationId: string,
  count: number
): void {
  broadcastToTenant(tenantId, {
    event: 'unread_count',
    data: {
      conversationId,
      count,
    },
  });
}

/**
 * Get active connection count (for monitoring)
 */
export function getActiveConnectionCount(): number {
  let total = 0;
  for (const connections of activeConnections.values()) {
    total += connections.size;
  }
  return total;
}

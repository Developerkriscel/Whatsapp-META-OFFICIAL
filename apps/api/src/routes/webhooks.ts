// WEBHOOK ROUTES -- WhatsApp and Stripe webhooks

import { FastifyInstance } from 'fastify';
import { handleWebhookVerification, parseIncomingMessage, isStopKeyword } from '@whatsapp-saas/config/guards';
import { getDefaultConfig } from '@whatsapp-saas/config/guards';

const whatsappConfig = getDefaultConfig();

/**
 * Register webhook routes
 */
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // ============================================
  // WhatsApp Webhook
  // ============================================

  // GET /webhook - Verification handshake
  app.get('/webhook', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const result = handleWebhookVerification(query, whatsappConfig);

    if (result.valid) {
      return reply.type('text/plain').send(result.challenge);
    }

    return reply.status(403).send('Forbidden');
  });

  // POST /webhook - Incoming events
  app.post('/webhook', async (request, reply) => {
    // Respond immediately to Meta
    await reply.code(200).send('OK');

    const body = request.body as any;

    // Process in background
    processWhatsAppWebhook(app, body).catch((err) => {
      console.error('WhatsApp webhook error:', err);
    });
  });

  // ============================================
  // Public Plans Route
  // ============================================

  app.get('/api/v1/plans', async (request, reply) => {
    const plans = await app.prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: 'asc' },
    });

    return { success: true, data: plans };
  });
}

// ============================================
// WhatsApp Webhook Processing
// ============================================

async function processWhatsAppWebhook(app: FastifyInstance, body: any) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes;
    for (const change of changes) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;

      if (!phoneNumberId) continue;

      // Find tenant by phone number
      const phoneNumber = await app.prisma.phoneNumber.findUnique({
        where: { metaPhoneId: phoneNumberId },
        include: { tenant: true },
      });

      if (!phoneNumber) {
        console.log('Unknown phone number:', phoneNumberId);
        continue;
      }

      const tenantId = phoneNumber.tenantId;

      // Process messages
      if (value.messages?.length) {
        for (const message of value.messages) {
          await processIncomingMessage(app, message, phoneNumber, tenantId);
        }
      }

      // Process status updates
      if (value.statuses?.length) {
        for (const status of value.statuses) {
          await processStatusUpdate(app, status, tenantId);
        }
      }
    }
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
  }
}

async function processIncomingMessage(
  app: FastifyInstance,
  message: any,
  phoneNumber: any,
  tenantId: string
) {
  const from = message.from;
  const messageId = message.id;
  const timestamp = new Date(parseInt(message.timestamp) * 1000);

  // Check for stop keywords
  const parsed = parseIncomingMessage(message);
  if (parsed.type === 'text' && isStopKeyword(parsed.body)) {
    await app.prisma.contact.updateMany({
      where: { tenantId, phone: from },
      data: { optOutAt: new Date(), blocked: true },
    });
    return;
  }

  // Get or create contact
  let contact = await app.prisma.contact.findFirst({
    where: { tenantId, phone: from },
  });

  if (!contact) {
    contact = await app.prisma.contact.create({
      data: {
        tenantId,
        phone: from,
        name: message.profile?.name || null,
        isActive: true,
      },
    });
  }

  // Get or create conversation
  let conversation = await app.prisma.conversation.findFirst({
    where: {
      tenantId,
      contactId: contact.id,
      phoneNumberId: phoneNumber.id,
    },
  });

  if (!conversation) {
    conversation = await app.prisma.conversation.create({
      data: {
        tenantId,
        contactId: contact.id,
        phoneNumberId: phoneNumber.id,
        status: 'OPEN',
      },
    });
  }

  // Create message record
  await app.prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      phoneNumberId: phoneNumber.id,
      metaMessageId: messageId,
      direction: 'INCOMING',
      type: (parsed.type.toUpperCase() as any) || 'TEXT',
      body: parsed.body,
      mediaUrl: parsed.mediaUrl,
      status: 'DELIVERED',
      deliveredAt: timestamp,
    },
  });

  // Update conversation
  await app.prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
    },
  });

  // Update contact stats
  await app.prisma.contact.update({
    where: { id: contact.id },
    data: {
      totalMessagesReceived: { increment: 1 },
      lastMessageAt: timestamp,
    },
  });

  // Mark as read
  if (!whatsappConfig.mockMode) {
    try {
      const { WhatsAppAPIClient } = await import('@whatsapp-saas/config/guards');
      const client = new WhatsAppAPIClient(whatsappConfig);
      await client.markAsRead(messageId, phoneNumber.metaPhoneId);
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  }
}

async function processStatusUpdate(
  app: FastifyInstance,
  status: any,
  tenantId: string
) {
  const messageId = status.id;
  const statusValue = status.status;

  // Map WhatsApp status to our status
  const statusMap: Record<string, string> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
    pending: 'PENDING',
  };

  const ourStatus = statusMap[statusValue];
  if (!ourStatus) return;

  // Update message status
  const updateData: any = { status: ourStatus };
  if (ourStatus === 'SENT') updateData.sentAt = new Date();
  if (ourStatus === 'DELIVERED') updateData.deliveredAt = new Date();
  if (ourStatus === 'READ') updateData.readAt = new Date();
  if (ourStatus === 'FAILED') updateData.failedAt = new Date();

  await app.prisma.message.updateMany({
    where: { metaMessageId: messageId, tenantId },
    data: updateData,
  });
}

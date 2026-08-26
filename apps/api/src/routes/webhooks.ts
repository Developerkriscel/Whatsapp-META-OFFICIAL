// WEBHOOK ROUTES -- WhatsApp and Stripe webhooks

import { FastifyInstance } from 'fastify';
import { handleWebhookVerification, parseIncomingMessage, isStopKeyword } from '@whatsapp-saas/config/guards';
import { getDefaultConfig } from '@whatsapp-saas/config/guards';
import { broadcastToTenant, broadcastMessageStatus } from './sse.js';

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
    // Verify X-Hub-Signature-256 to ensure request is from Meta
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = (request.headers['x-hub-signature-256'] as string) || '';
      const rawBody = JSON.stringify(request.body);
      const { createHmac } = await import('crypto');
      const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        return reply.code(403).send('Forbidden');
      }
    }

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

export async function processWhatsAppWebhook(app: FastifyInstance, body: any) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes;
    for (const change of changes) {
      const value = change.value;

      // Template approval/rejection events are account-level (no phone_number_id) —
      // handle them before the phone-number lookup below skips them.
      if (change.field === 'message_template_status_update') {
        await processTemplateStatusUpdate(app, value);
        continue;
      }

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

const TEMPLATE_EVENT_TO_STATUS: Record<string, 'APPROVED' | 'REJECTED' | 'PENDING' | 'DEPRECATED'> = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PENDING: 'PENDING',
  FLAGGED: 'REJECTED',
  PAUSED: 'DEPRECATED',
  DISABLED: 'DEPRECATED',
};

async function processTemplateStatusUpdate(app: FastifyInstance, value: any) {
  const metaTemplateId = String(value.message_template_id ?? '');
  const status = TEMPLATE_EVENT_TO_STATUS[value.event];
  if (!metaTemplateId || !status) return;

  const now = new Date();
  const updated = await app.prisma.template.updateMany({
    where: { metaTemplateId },
    data: {
      status,
      rejectionReason: status === 'REJECTED' ? value.reason ?? null : null,
      approvedAt: status === 'APPROVED' ? now : undefined,
      rejectedAt: status === 'REJECTED' ? now : undefined,
    },
  });

  if (updated.count > 0) {
    const template = await app.prisma.template.findFirst({ where: { metaTemplateId }, select: { id: true, tenantId: true, name: true, status: true } });
    if (template) {
      broadcastToTenant(template.tenantId, {
        event: 'template_status_update',
        data: { templateId: template.id, name: template.name, status: template.status },
      });
    }
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

  // Meta retries webhook deliveries on any non-2xx/slow response — skip if we've
  // already recorded this wamid so retries don't create duplicate messages or
  // re-trigger bot flows.
  const existingMessage = await app.prisma.message.findFirst({
    where: { tenantId, metaMessageId: messageId },
    select: { id: true },
  });
  if (existingMessage) {
    await logWebhookEvent(app, tenantId, phoneNumber.id, 'messages', messageId, from, { message }, 'DUPLICATE_SKIPPED');
    return;
  }

  // Check for stop keywords
  const parsed = parseIncomingMessage(message);
  if (parsed.type === 'text' && isStopKeyword(parsed.body)) {
    await app.prisma.contact.updateMany({
      where: { tenantId, phone: from },
      data: {
        consentStatus: 'OPTED_OUT',
        optOutAt: new Date(),
        blocked: true,
        consentSource: 'webhook_stop',
        consentReference: messageId, // wamid of the STOP message itself — compliance proof
      },
    });
    return;
  }

  // Get or create contact
  let contact = await app.prisma.contact.findFirst({
    where: { tenantId, phone: from },
  });

  if (!contact) {
    // Contact initiated conversation - they are opted in by default
    contact = await app.prisma.contact.create({
      data: {
        tenantId,
        phone: from,
        name: message.profile?.name || null,
        isActive: true,
        consentStatus: 'OPTED_IN', // Initiated conversation = consent
        consentSource: 'webhook',
        consentReference: messageId,
        optInAt: new Date(),
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
  const newMessage = await app.prisma.message.create({
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

  // Log webhook event
  await logWebhookEvent(app, tenantId, phoneNumber.id, 'messages', messageId, from, { message }, 'COMPLETED');

  // Broadcast new message to all connected clients
  broadcastToTenant(tenantId, {
    event: 'new_message',
    data: {
      message: {
        id: newMessage.id,
        conversationId: conversation.id,
        body: newMessage.body,
        direction: 'INCOMING',
        timestamp: timestamp.toISOString(),
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
        },
      },
    },
  });

  // Update conversation and broadcast unread count
  await app.prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
      unreadCount: { increment: 1 },
    },
  });

  // Broadcast unread count update
  const unreadCount = await app.prisma.conversation.count({
    where: { tenantId, status: 'OPEN', unreadCount: { gt: 0 } },
  });
  broadcastToTenant(tenantId, {
    event: 'unread_count',
    data: { count: unreadCount },
  });
  await app.prisma.contact.update({
    where: { id: contact.id },
    data: {
      totalMessagesReceived: { increment: 1 },
      lastMessageAt: timestamp,
    },
  });

  // Auto-trigger a connected bot flow for this inbound message. Previously
  // flows could only be started via a manual POST /automation/trigger call —
  // a connected flow never actually engaged a real customer on its own.
  // Skip if the conversation already has the bot paused (human took over) or
  // already has an ACTIVE execution running (avoid double-triggering on a
  // burst of messages while a flow is mid-step).
  if (conversation.isBotActive) {
    const activeExecution = await app.prisma.botExecution.findFirst({
      where: { conversationId: conversation.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!activeExecution) {
      // Fire-and-forget: a flow can now contain a real `delay` step, and
      // Meta expects a fast webhook ack — awaiting this here would hold the
      // HTTP response open (and risk Meta treating it as a failed delivery
      // and retrying) for however long the flow takes to run.
      const { triggerFlowForConversation } = await import('./automation.js');
      triggerFlowForConversation(app, tenantId, conversation.id, {
        keyword: parsed.type === 'text' ? parsed.body : undefined,
      }).catch((err) => console.error('Failed to auto-trigger bot flow:', err));
    }
  }

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
  if (ourStatus === 'FAILED') {
    updateData.failedAt = new Date();
    // Meta's async status webhook (unlike the synchronous send-API response)
    // carries the real failure reason in `errors` — this was being silently
    // discarded, so a message that Meta initially accepted (real wamid) but
    // later failed to deliver just showed FAILED with no explanation at all.
    const metaError = status.errors?.[0];
    if (metaError) {
      updateData.errorCode = metaError.code?.toString();
      updateData.errorMessage = metaError.error_data?.details || metaError.title || metaError.message;
    }
  }

  // Fetch the current row first — need its prior status (to avoid
  // double-counting a campaign's aggregate stats if Meta retries the same
  // webhook) and its campaignId (to know which campaign to credit at all).
  const existing = await app.prisma.message.findFirst({
    where: { metaMessageId: messageId, tenantId },
    select: { id: true, status: true, campaignId: true, conversationId: true },
  });

  if (!existing) {
    await logWebhookEvent(app, tenantId, null, 'message_statuses', messageId, null, { status }, 'COMPLETED');
    return;
  }

  const isNewTransition = existing.status !== ourStatus;

  await app.prisma.message.update({
    where: { id: existing.id },
    data: updateData,
  });

  // Campaign cards showed 0% delivered/read forever — the per-message
  // status was updated above, but nothing ever rolled that back up into
  // the campaign's own totalDelivered/totalRead/totalFailed counters that
  // the Campaigns page actually reads for its stats.
  if (existing.campaignId && isNewTransition) {
    const campaignField =
      ourStatus === 'DELIVERED' ? 'totalDelivered' :
      ourStatus === 'READ' ? 'totalRead' :
      ourStatus === 'FAILED' ? 'totalFailed' :
      null;
    if (campaignField) {
      await app.prisma.campaign.update({
        where: { id: existing.campaignId },
        data: { [campaignField]: { increment: 1 } },
      }).catch(() => {});
    }
  }

  // Broadcast status update to connected clients
  broadcastMessageStatus(tenantId, messageId, existing.conversationId, ourStatus as any);

  // Log webhook event
  await logWebhookEvent(app, tenantId, null, 'message_statuses', messageId, null, { status }, 'COMPLETED');
}

/**
 * Log webhook event for debugging
 */
async function logWebhookEvent(
  app: FastifyInstance,
  tenantId: string,
  phoneNumberId: string | null,
  event: string,
  messageId: string | null,
  from: string | null,
  rawPayload: any,
  webhookStatus: string
) {
  try {
    const startTime = Date.now();
    await app.prisma.webhookLog.create({
      data: {
        tenantId,
        phoneNumberId,
        event,
        messageId,
        from,
        rawPayload,
        status: webhookStatus as any,
        processingTimeMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('Failed to log webhook event:', error);
  }
}

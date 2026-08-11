import { FastifyInstance } from 'fastify';

export interface DispatchMessageParams {
  app: FastifyInstance;
  messageId: string;
  tenantId: string;
  contactPhone: string;
  phoneNumberId: string;
  body: string;
  type?: 'text' | 'template';
}

/**
 * Dispatches an outbound WhatsApp message to Meta Cloud API.
 * Uses tenant credentials if available, falling back to server environment configuration.
 * Updates message status in database to SENT or FAILED.
 */
export async function dispatchOutboundMessage(params: DispatchMessageParams): Promise<any> {
  const { app, messageId, tenantId, contactPhone, phoneNumberId, body } = params;

  try {
    // 1. Fetch Tenant's WhatsApp Credentials & Phone Number Record
    const [creds, phoneRecord] = await Promise.all([
      app.prisma.whatsAppCredentials.findUnique({ where: { tenantId } }),
      app.prisma.phoneNumber.findFirst({ where: { id: phoneNumberId, tenantId } }),
    ]);

    const token = phoneRecord?.accessToken || creds?.accessToken || (process.env.META_ACCESS_TOKEN !== 'your-system-user-access-token' ? process.env.META_ACCESS_TOKEN : null);
    const metaPhoneId = phoneRecord?.metaPhoneId || (creds as any)?.metaPhoneId || (process.env.META_PHONE_NUMBER_ID !== 'your-phone-number-id' ? process.env.META_PHONE_NUMBER_ID : null);

    // Format phone number to clean E.164 without leading '+' for Meta API
    const formattedTo = contactPhone.replace(/[^\d]/g, '');

    const isMock = process.env.WHATSAPP_MOCK_MODE === 'true';

    console.log(`[DISPATCH] token=${token ? 'EXISTS(' + token.substring(0, 10) + '...)' : 'MISSING'}, metaPhoneId=${metaPhoneId}, isMock=${isMock}, envMockMode=${process.env.WHATSAPP_MOCK_MODE}`);

    // 2. If real Meta credentials & phone ID are available, invoke Meta Graph API
    if (token && metaPhoneId && !isMock) {
      const url = `https://graph.facebook.com/v18.0/${metaPhoneId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedTo,
          type: 'text',
          text: { body },
        }),
      });

      const responseData: any = await response.json();

      if (response.ok && responseData?.messages?.[0]?.id) {
        const metaMessageId = responseData.messages[0].id;
        const updated = await app.prisma.message.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            metaMessageId,
            sentAt: new Date(),
          },
        });
        return { success: true, status: 'SENT', metaMessageId, data: updated };
      } else {
        const errMessage = responseData?.error?.message || responseData?.message || 'Meta API call failed';
        const errCode = responseData?.error?.code?.toString() || 'META_API_ERROR';
        
        const updated = await app.prisma.message.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            errorCode: errCode,
            errorMessage: errMessage,
            failedAt: new Date(),
          },
        });
        return { success: false, status: 'FAILED', error: errMessage, data: updated };
      }
    }

    // 3. Fallback / Mock Mode: Simulate immediate dispatch for testing environments
    const mockMetaId = `wamid.mock.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    const updated = await app.prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        metaMessageId: mockMetaId,
        sentAt: new Date(),
      },
    });

    return { success: true, status: 'SENT', metaMessageId: mockMetaId, data: updated };
  } catch (err: any) {
    const errMessage = err?.message || 'Unknown dispatch error';
    await app.prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        errorMessage: errMessage,
        failedAt: new Date(),
      },
    }).catch(() => {});

    return { success: false, status: 'FAILED', error: errMessage };
  }
}

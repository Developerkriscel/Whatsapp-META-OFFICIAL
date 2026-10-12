import { FastifyInstance } from 'fastify';

export async function registerCashfreeWebhook(app: FastifyInstance) {
  app.post('/webhooks/cashfree', { config: { rawBody: true } }, async (request, reply) => {
    const signature = request.headers['x-webhook-signature'] as string | undefined;
    const timestamp = request.headers['x-webhook-timestamp'] as string | undefined;
    const raw = (request as any).rawBody as string | undefined;

    if (!signature || !timestamp || !raw) {
      return reply.status(400).send({ success: false, error: 'Missing Cashfree signature, timestamp, or body' });
    }

    const { verifyCashfreeWebhookSignature, confirmCashfreeOrder } =
      await import('../services/payments.js');
    const valid = await verifyCashfreeWebhookSignature(app.prisma, raw, timestamp, signature);
    if (!valid) {
      app.log.warn('[cashfree] webhook signature rejected');
      return reply.status(401).send({ success: false, error: 'Bad signature' });
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return reply.status(400).send({ success: false, error: 'Body was not JSON' });
    }

    const orderId = event?.data?.order?.order_id;
    const paymentStatus = event?.data?.payment?.payment_status;
    if (paymentStatus === 'SUCCESS' && typeof orderId === 'string') {
      const result = await confirmCashfreeOrder(app.prisma, orderId);
      app.log.info(`[cashfree] payment for ${orderId} -> ${result.credited ? `credited ${result.credits}` : result.reason}`);
    } else if (paymentStatus === 'FAILED' && typeof orderId === 'string') {
      await app.prisma.paymentOrder.updateMany({
        where: { provider: 'cashfree', providerOrderId: orderId, status: 'CREATED' },
        data: { failureReason: event?.data?.payment?.payment_message || 'Cashfree payment attempt failed' },
      });
      app.log.info(`[cashfree] payment failed for ${orderId}`);
    }

    return reply.send({ received: true });
  });
}

/**
 * Razorpay webhook — the authoritative confirmation of a purchase.
 *
 * The browser callback is a convenience: it lets the page update the moment the
 * gateway hands control back. This is what actually decides a purchase
 * completed, because it arrives whether or not the buyer's tab survived the
 * redirect, and it arrives again if we fail to answer.
 *
 * Signature is checked against the raw body — re-serialising the parsed JSON
 * produces different bytes and the HMAC will not match.
 */
import { FastifyInstance } from 'fastify';

export async function registerRazorpayWebhook(app: FastifyInstance) {
  app.post('/webhooks/razorpay', { config: { rawBody: true } }, async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string | undefined;
    const raw = (request as any).rawBody as string | undefined;

    if (!signature || !raw) {
      return reply.status(400).send({ success: false, error: 'Missing signature or body' });
    }

    const { verifyWebhookSignature, confirmPayment } = await import('../services/payments.js');

    const ok = await verifyWebhookSignature(app.prisma, raw, signature);
    if (!ok) {
      // Not an error worth retrying — either the secret is wrong or this did
      // not come from Razorpay.
      console.warn('[razorpay] webhook signature rejected');
      return reply.status(401).send({ success: false, error: 'Bad signature' });
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return reply.status(400).send({ success: false, error: 'Body was not JSON' });
    }

    const payment = event?.payload?.payment?.entity;
    const type = event?.event as string | undefined;

    // Answer quickly and unconditionally on anything we do not handle: an
    // unacknowledged webhook is retried, and retrying an event we will never
    // act on achieves nothing.
    if (!payment || !type) return reply.send({ received: true });

    try {
      if (type === 'payment.captured' || type === 'payment.authorized') {
        const result = await confirmPayment(app.prisma, {
          orderId: payment.order_id,
          paymentId: payment.id,
          viaWebhook: true,
        });
        console.log(`[razorpay] ${type} ${payment.id} -> ${result.credited ? `credited ${result.credits}` : result.reason}`);
      } else if (type === 'payment.failed') {
        await app.prisma.paymentOrder.updateMany({
          where: { providerOrderId: payment.order_id, status: 'CREATED' },
          data: { status: 'FAILED', failureReason: payment.error_description || 'Payment failed' },
        });
        console.log(`[razorpay] payment.failed ${payment.id}`);
      }
    } catch (err: any) {
      // Log and still acknowledge. A 500 here means Razorpay retries, and the
      // crediting path is idempotent, so a genuine transient failure is
      // recoverable — but an error we would never recover from should not be
      // retried forever.
      console.error('[razorpay] webhook handling failed:', err?.message);
    }

    return reply.send({ received: true });
  });
}

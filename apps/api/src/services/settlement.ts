/**
 * Charge on delivery.
 *
 * A message is only worth paying for if it reached the handset. Meta bills us
 * the same way, so billing a tenant for a message that failed means keeping
 * money for something nobody received.
 *
 * The balance is still debited when the message is sent — that is what stops a
 * tenant with an empty balance from queueing ten thousand messages — but the
 * debit is a hold rather than a settlement. Meta's status webhook then decides
 * it: `delivered` (or `read`, which implies it) settles the hold and the money
 * is earned; a terminal failure returns it in full.
 *
 * MessageCredit is the record of the hold, one row per charged message, unique
 * on messageId. Its `refunded` flag is what makes the refund idempotent —
 * Meta retries webhooks, and a retry must not pay a tenant twice.
 */
import type { PrismaClient } from '@prisma/client';

/** WhatsApp gives up on an undelivered message after 24 hours. */
export const DELIVERY_WINDOW_HOURS = 24;

/**
 * Records the hold taken when a message was sent.
 *
 * Called on every charged send. Without this row nothing can be returned later,
 * which is exactly the state the product was in: recordMessageCredit existed
 * but was never called from any send path, so message_credits was empty and no
 * refund was possible even in principle.
 */
export async function holdForMessage(
  prisma: PrismaClient,
  data: {
    tenantId: string;
    messageId: string;
    country: string | null | undefined;
    category: string;
    paise: number;
  },
): Promise<void> {
  // A zero-cost message is still recorded. Meta does not charge for replies
  // inside an open service window, and a bill that silently omits them cannot
  // show that they were free — it just looks like they never happened.
  if (data.paise < 0) return;
  await prisma.messageCredit.create({
    data: {
      tenantId: data.tenantId,
      messageId: data.messageId,
      countryCode: (data.country || 'IN').toUpperCase(),
      category: data.category,
      cost: data.paise,
      refunded: false,
    },
  }).catch((err: any) => {
    // Unique violation means the hold is already recorded — a retried send
    // path, not a problem. Anything else is worth knowing about.
    if (err?.code !== 'P2002') {
      console.error(`[Settlement] could not record hold for message ${data.messageId}:`, err?.message);
    }
  });
}

/**
 * Returns the hold on a message that will never be delivered.
 *
 * Idempotent: the flag is set in the same transaction that credits the
 * balance, and a row already marked refunded is left alone. Returns the amount
 * actually returned, which is 0 when there was nothing to return.
 */
export async function refundUndelivered(
  prisma: PrismaClient,
  messageId: string,
  reason: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.messageCredit.findUnique({ where: { messageId } });
    if (!hold || hold.refunded || hold.cost <= 0) return 0;

    const account = await tx.tenantCredit.findUnique({ where: { tenantId: hold.tenantId } });
    if (!account) return 0;

    const updated = await tx.tenantCredit.update({
      where: { tenantId: hold.tenantId },
      data: {
        balance: { increment: hold.cost },
        // The message was never delivered, so it was never usage. Leaving
        // totalUsed inflated would overstate every lifetime-spend figure.
        totalUsed: { decrement: hold.cost },
      },
    });

    await tx.tenantCreditTransaction.create({
      data: {
        creditId: updated.id,
        type: 'REFUND',
        amount: hold.cost,
        referenceId: messageId,
        referenceType: 'MESSAGE',
        description: reason,
        balanceAfter: updated.balance,
      },
    });

    await tx.messageCredit.update({
      where: { messageId },
      data: { refunded: true, refundedAt: new Date(), refundAmount: hold.cost },
    });

    return hold.cost;
  });
}

/**
 * Returns holds on messages that were accepted by Meta but never reported
 * delivered inside WhatsApp's 24-hour window.
 *
 * A failure webhook covers the cases Meta tells us about. This covers the ones
 * it does not: a handset that never comes online simply stops producing
 * statuses, and without a sweep those holds would be kept for ever — which is
 * the same as charging for an undelivered message, just quietly.
 */
export async function sweepExpiredHolds(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ swept: number; refundedPaise: number }> {
  const cutoff = new Date(now.getTime() - DELIVERY_WINDOW_HOURS * 60 * 60 * 1000);

  const stale = await prisma.messageCredit.findMany({
    where: {
      refunded: false,
      createdAt: { lt: cutoff },
      message: {
        // Anything that reached a handset is settled, whatever it did after.
        status: { notIn: ['DELIVERED', 'READ'] },
      },
    },
    select: { messageId: true },
    take: 500,
  });

  let refundedPaise = 0;
  for (const row of stale) {
    refundedPaise += await refundUndelivered(
      prisma,
      row.messageId,
      `Not delivered within ${DELIVERY_WINDOW_HOURS}h`,
    );
  }
  return { swept: stale.length, refundedPaise };
}

import { PrismaClient } from '@prisma/client';

/**
 * Per-phone daily send quota.
 *
 * `todaySentCount` used to be read in several places and written in none, so
 * every usage bar in the panel showed 0 and `dailySentLimit` enforced nothing.
 *
 * A slot is reserved *before* the Meta call rather than counted after it, so
 * parallel campaign batches can't collectively overshoot the cap — the check
 * and the increment are one atomic statement. If the send then fails at the
 * transport level the slot is released, keeping the count equal to messages
 * Meta actually accepted.
 *
 * The 24h window resets lazily inside the same statement: no cron job to drift
 * or miss, and a phone that goes quiet for a week still starts fresh.
 */

const WINDOW = '24 hours';

export interface SendSlot {
  allowed: boolean;
  todaySentCount: number;
  dailySentLimit: number;
  /** Set when allowed is false, suitable for surfacing to the user. */
  reason?: string;
}

export async function reserveSendSlot(
  prisma: PrismaClient,
  phoneNumberId: string,
): Promise<SendSlot> {
  // One statement: reset the window if it has elapsed, then increment — but
  // only if that keeps us at or under the limit. Zero rows back means the cap
  // is reached (or the phone is gone), never a lost update.
  const rows = await prisma.$queryRawUnsafe<Array<{ todaySentCount: number; dailySentLimit: number }>>(
    `UPDATE phone_numbers
        SET "todaySentCount" = CASE WHEN "lastResetAt" < now() - interval '${WINDOW}'
                                    THEN 1 ELSE "todaySentCount" + 1 END,
            "lastResetAt"    = CASE WHEN "lastResetAt" < now() - interval '${WINDOW}'
                                    THEN now() ELSE "lastResetAt" END
      WHERE id = $1
        AND ("lastResetAt" < now() - interval '${WINDOW}'
             OR "todaySentCount" < "dailySentLimit")
      RETURNING "todaySentCount", "dailySentLimit"`,
    phoneNumberId,
  );

  if (rows.length > 0) {
    return {
      allowed: true,
      todaySentCount: Number(rows[0].todaySentCount),
      dailySentLimit: Number(rows[0].dailySentLimit),
    };
  }

  // Nothing updated — read back to say why, so the caller can distinguish a
  // real cap from a phone number that no longer exists.
  const phone = await prisma.phoneNumber.findUnique({
    where: { id: phoneNumberId },
    select: { todaySentCount: true, dailySentLimit: true },
  });

  if (!phone) {
    return { allowed: false, todaySentCount: 0, dailySentLimit: 0, reason: 'Phone number not found' };
  }

  return {
    allowed: false,
    todaySentCount: phone.todaySentCount,
    dailySentLimit: phone.dailySentLimit,
    reason: `Daily send limit reached for this number (${phone.dailySentLimit} per 24h). It resets automatically.`,
  };
}

/**
 * Returns a reserved slot after a failed send. Floors at zero so a release
 * that races a window reset can't drive the counter negative.
 */
export async function releaseSendSlot(
  prisma: PrismaClient,
  phoneNumberId: string,
): Promise<void> {
  await prisma
    .$executeRawUnsafe(
      `UPDATE phone_numbers
          SET "todaySentCount" = GREATEST("todaySentCount" - 1, 0)
        WHERE id = $1`,
      phoneNumberId,
    )
    .catch(() => {
      // Best effort — a failed release must never mask the send error that
      // triggered it.
    });
}

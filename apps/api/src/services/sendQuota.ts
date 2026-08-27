import { PrismaClient } from '@prisma/client';

/**
 * Meta's messaging tiers. The number is a cap on how many *unique customers*
 * a phone number may message in a rolling 24h window — not a message count, so
 * ten messages to one customer consume one unit, not ten.
 */
export const TIER_LIMITS: Record<string, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: null, // null = uncapped
  NOT_ELIGIBLE: 0,
};

export interface TierUsage {
  tier: string | null;
  /** null when the tier is uncapped or unknown. */
  limit: number | null;
  uniqueCustomers24h: number;
  /** null when there is no cap to remain under. */
  remaining: number | null;
}

/**
 * How much of Meta's 24h unique-customer allowance this number has used.
 *
 * Counts distinct contacts we sent to and Meta accepted — a rejected send never
 * reached a customer and doesn't consume allowance.
 */
export async function getTierUsage(
  prisma: PrismaClient,
  phoneNumberId: string,
): Promise<TierUsage> {
  const phone = await prisma.phoneNumber.findUnique({
    where: { id: phoneNumberId },
    select: { messagingLimitTier: true },
  });

  const tier = phone?.messagingLimitTier ?? null;
  const limit = tier ? TIER_LIMITS[tier] ?? null : null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.message.findMany({
    where: {
      phoneNumberId,
      direction: 'OUTGOING',
      createdAt: { gte: since },
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
    },
    select: { contactId: true },
    distinct: ['contactId'],
  });

  const uniqueCustomers24h = rows.length;

  return {
    tier,
    limit,
    uniqueCustomers24h,
    remaining: limit === null ? null : Math.max(limit - uniqueCustomers24h, 0),
  };
}

/**
 * Whether this number can still start a conversation with `newCustomers` people
 * it hasn't messaged in the last 24h. Used to warn at campaign creation rather
 * than letting a campaign discover the cap part-way through its recipient list.
 */
export async function checkTierCapacity(
  prisma: PrismaClient,
  phoneNumberId: string,
  newCustomers: number,
): Promise<{ withinTier: boolean; usage: TierUsage; message?: string }> {
  const usage = await getTierUsage(prisma, phoneNumberId);

  // Unknown tier or an uncapped one — nothing to enforce.
  if (usage.limit === null || usage.remaining === null) {
    return { withinTier: true, usage };
  }

  if (newCustomers <= usage.remaining) {
    return { withinTier: true, usage };
  }

  const tierName = usage.tier ? usage.tier.replace(/_/g, ' ') : 'current';

  return {
    withinTier: false,
    usage,
    message:
      `This would message ${newCustomers} people, but Meta's ${tierName} limit allows ${usage.limit} ` +
      `unique recipients per 24 hours and ${usage.uniqueCustomers24h} have already been messaged from ` +
      `this number. ${usage.remaining} remaining — the rest would be rejected by Meta.`,
  };
}

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

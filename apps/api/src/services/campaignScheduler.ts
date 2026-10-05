/**
 * Runs campaigns when their scheduled time arrives.
 *
 * Setting a date moved a campaign to SCHEDULED and nothing ever looked at it
 * again: there was no cron, no interval, no polling anywhere in the codebase.
 * A scheduled campaign simply waited for ever, which is indistinguishable from
 * the feature working right up until the moment it should have sent.
 */
import type { FastifyInstance } from 'fastify';

/** How often to look for campaigns that have come due. */
export const TICK_MS = 60_000;

/**
 * Claims one campaign at a time with a conditional update, so two instances
 * polling the same table cannot both start the same send. Whichever update
 * matches first flips it out of SCHEDULED; the other matches nothing.
 */
export async function runDueCampaigns(app: FastifyInstance): Promise<number> {
  const now = new Date();

  const due = await app.prisma.campaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { not: null, lte: now } },
    select: { id: true, tenantId: true, name: true, scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  });

  let started = 0;
  for (const c of due) {
    // Conditional on status so the claim is atomic: if another worker already
    // moved it, updateMany reports zero rows and this one steps aside.
    const claimed = await app.prisma.campaign.updateMany({
      where: { id: c.id, status: 'SCHEDULED' },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const lateBy = Math.round((now.getTime() - (c.scheduledAt as Date).getTime()) / 1000);
    console.log(`[Scheduler] starting "${c.name}" (${lateBy}s after its scheduled time)`);

    const { sendCampaignMessages } = await import('../routes/tenant.js');
    // Not awaited: one long campaign must not hold up the others that are due.
    // sendCampaignMessages already resolves every campaign to a terminal
    // status on its own failure path.
    sendCampaignMessages(app, c.id, c.tenantId).catch((err: any) =>
      console.error(`[Scheduler] "${c.name}" failed:`, err?.message),
    );
    started++;
  }
  return started;
}

export function startCampaignScheduler(app: FastifyInstance): NodeJS.Timeout {
  const tick = () =>
    runDueCampaigns(app).catch((err: any) =>
      console.error('[Scheduler] tick failed:', err?.message),
    );
  tick();
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  return timer;
}

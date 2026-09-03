// Main API Entry Point

import Fastify from 'fastify';
import { buildApp } from './app.js';
import { sendCampaignMessages } from './routes/tenant.js';

// A campaign left in SENDING status means the process died mid-send (deploy,
// crash, OOM) — resume it. sendCampaignMessages is dedupe-safe: it skips any
// contact that already has a Message row for this campaignId, so this never
// double-sends or double-charges credits.
async function resumeInterruptedCampaigns(app: Awaited<ReturnType<typeof buildApp>>) {
  try {
    const stuck = await app.prisma.campaign.findMany({
      where: { status: 'SENDING' },
      select: { id: true, tenantId: true, name: true },
    });

    if (stuck.length === 0) return;

    console.log(`[Startup] Resuming ${stuck.length} campaign(s) left in SENDING state`);
    for (const campaign of stuck) {
      sendCampaignMessages(app, campaign.id, campaign.tenantId).catch((err) => {
        console.error(`[Startup] Resume failed for campaign ${campaign.id}:`, err);
      });
    }
  } catch (err) {
    console.error('[Startup] Campaign reconciliation check failed:', err);
  }
}

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: parseInt(process.env.PORT || '3001'),
      host: '0.0.0.0',
    });
    console.log(`🚀 API server running at ${address}`);

    // Billing reads prices from an in-memory cache so the per-message lookup can
    // stay synchronous. Load it before anything can send: an empty cache falls
    // back to Meta's list prices, which would bill at cost rather than at the
    // configured rate. Refreshed periodically so a price set on one instance
    // reaches the others without a restart.
    try {
      const { seedCreditRates, refreshRateCache } = await import('./services/creditService.js');
      const seeded = await seedCreditRates(app.prisma);
      const loaded = await refreshRateCache(app.prisma);
      console.log(`[Credits] rate cache loaded: ${loaded} countries${seeded ? ` (seeded ${seeded} new)` : ''}`);

      const RATE_REFRESH_MS = 5 * 60 * 1000;
      const timer = setInterval(() => {
        refreshRateCache(app.prisma).catch((e) =>
          console.error('[Credits] rate cache refresh failed:', e?.message),
        );
      }, RATE_REFRESH_MS);
      timer.unref();
    } catch (e: any) {
      // Sending still works — getRateCredits falls back to Meta's published
      // prices — so this must not stop the server coming up.
      console.error('[Credits] could not load rate cache, falling back to list prices:', e?.message);
    }

    await resumeInterruptedCampaigns(app);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

// Main API Entry Point
import { buildApp } from './app.js';
import { sendCampaignMessages } from './routes/tenant.js';
// A campaign left in SENDING status means the process died mid-send (deploy,
// crash, OOM) — resume it. sendCampaignMessages is dedupe-safe: it skips any
// contact that already has a Message row for this campaignId, so this never
// double-sends or double-charges credits.
async function resumeInterruptedCampaigns(app) {
    try {
        const stuck = await app.prisma.campaign.findMany({
            where: { status: 'SENDING' },
            select: { id: true, tenantId: true, name: true },
        });
        if (stuck.length === 0)
            return;
        console.log(`[Startup] Resuming ${stuck.length} campaign(s) left in SENDING state`);
        for (const campaign of stuck) {
            sendCampaignMessages(app, campaign.id, campaign.tenantId).catch((err) => {
                console.error(`[Startup] Resume failed for campaign ${campaign.id}:`, err);
            });
        }
    }
    catch (err) {
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
        await resumeInterruptedCampaigns(app);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map
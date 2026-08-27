/**
 * Meta App Review compliance endpoints — Data Deletion & Deauthorize callbacks.
 * Required by Meta for any app using Facebook Login (Embedded Signup relies on it).
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import crypto from 'crypto';
function base64UrlDecode(input) {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64');
}
function parseSignedRequest(signedRequest, appSecret) {
    const [encodedSig, encodedPayload] = signedRequest.split('.');
    if (!encodedSig || !encodedPayload) {
        throw new Error('Malformed signed_request');
    }
    const sig = base64UrlDecode(encodedSig);
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (payload.algorithm?.toUpperCase() !== 'HMAC-SHA256') {
        throw new Error('Unsupported signed_request algorithm');
    }
    const expectedSig = crypto.createHmac('sha256', appSecret).update(encodedPayload).digest();
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
        throw new Error('Invalid signed_request signature');
    }
    return payload;
}
export async function registerMetaComplianceRoutes(app) {
    /**
     * POST /meta/data-deletion - Meta's Data Deletion Request callback.
     * Called when a user removes this app from their Facebook "Apps and Websites" settings.
     */
    app.post('/meta/data-deletion', async (request, reply) => {
        const { signed_request } = request.body;
        const appSecret = process.env.META_APP_SECRET || '';
        if (!signed_request || !appSecret) {
            return reply.status(400).send({ error: 'Missing signed_request' });
        }
        let payload;
        try {
            payload = parseSignedRequest(signed_request, appSecret);
        }
        catch (err) {
            app.log.warn(`Data deletion signed_request rejected: ${err.message}`);
            return reply.status(400).send({ error: 'Invalid signed_request' });
        }
        const confirmationCode = crypto.randomBytes(16).toString('hex');
        // Best-effort correlation: a tenant's WhatsApp credentials don't store the
        // Meta user ID today, so this creates an auditable request record now and
        // an operator can complete the actual data purge against it.
        const record = await app.prisma.dataDeletionRequest.create({
            data: {
                metaUserId: payload.user_id,
                confirmationCode,
                status: 'PENDING',
            },
        });
        app.log.info(`Data deletion request received for Meta user ${payload.user_id} (confirmation ${confirmationCode})`);
        const statusUrl = `${process.env.PUBLIC_API_URL || process.env.API_URL || 'https://api.kriscelwa.online'}/api/v1/meta/data-deletion-status?id=${record.id}`;
        return {
            url: statusUrl,
            confirmation_code: confirmationCode,
        };
    });
    /**
     * GET /meta/data-deletion-status - Status page Meta (or the requesting user) can check.
     */
    app.get('/meta/data-deletion-status', async (request, reply) => {
        const { id } = request.query;
        if (!id) {
            return reply.status(400).send({ error: 'Missing id' });
        }
        const record = await app.prisma.dataDeletionRequest.findUnique({ where: { id } });
        if (!record) {
            return reply.status(404).send({ error: 'Deletion request not found' });
        }
        return {
            confirmation_code: record.confirmationCode,
            status: record.status,
            created_at: record.createdAt,
            completed_at: record.completedAt,
        };
    });
    /**
     * POST /meta/deauthorize - Meta's Deauthorize callback (app removed, not full data deletion).
     * Same signed_request shape as data deletion.
     */
    app.post('/meta/deauthorize', async (request, reply) => {
        const { signed_request } = request.body;
        const appSecret = process.env.META_APP_SECRET || '';
        if (!signed_request || !appSecret) {
            return reply.status(400).send({ error: 'Missing signed_request' });
        }
        try {
            const payload = parseSignedRequest(signed_request, appSecret);
            app.log.info(`App deauthorized by Meta user ${payload.user_id}`);
        }
        catch (err) {
            app.log.warn(`Deauthorize signed_request rejected: ${err.message}`);
            return reply.status(400).send({ error: 'Invalid signed_request' });
        }
        return reply.status(200).send();
    });
    /**
     * GET /data-deletion-instructions - Human-readable fallback page (usable as the
     * simpler "Data Deletion Instructions URL" option in App Settings if preferred
     * over the callback URL above).
     */
    app.get('/data-deletion-instructions', async (_request, reply) => {
        reply.type('text/html').send(`<!doctype html>
<html><head><title>Data Deletion Instructions</title></head>
<body style="font-family: sans-serif; max-width: 640px; margin: 40px auto; line-height: 1.6;">
<h1>Data Deletion Instructions</h1>
<p>If you connected your WhatsApp Business Account to Kriscel WA via Facebook Login and want your data deleted, email <a href="mailto:privacy@kriscelwa.online">privacy@kriscelwa.online</a> from the email address associated with your account, or ask your workspace owner to delete your workspace from Settings.</p>
<p>We will confirm deletion within 30 days.</p>
</body></html>`);
    });
}
//# sourceMappingURL=metaCompliance.js.map
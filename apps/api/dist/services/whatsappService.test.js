import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchOutboundMessage } from './whatsappService.js';
import { encryptSecret } from './credentialEncryption.js';
function makeApp({ creds, phoneRecord }) {
    return {
        prisma: {
            whatsAppCredentials: { findUnique: vi.fn().mockResolvedValue(creds) },
            phoneNumber: { findFirst: vi.fn().mockResolvedValue(phoneRecord) },
            message: { update: vi.fn().mockResolvedValue({ id: 'message-1' }) },
        },
    };
}
const baseParams = {
    messageId: 'message-1',
    tenantId: 'tenant-a',
    contactPhone: '+1 555 123 4567',
    phoneNumberId: 'phone-1',
    body: 'hello',
};
describe('dispatchOutboundMessage - credential resolution', () => {
    const originalFetch = global.fetch;
    const originalEnvToken = process.env.META_ACCESS_TOKEN;
    const originalMockMode = process.env.WHATSAPP_MOCK_MODE;
    beforeEach(() => {
        // These tests exercise the real-send branch, so mock mode must be off -
        // it's forced on globally (vitest.config.ts) so webhooks.test.ts can
        // skip an unrelated network call.
        process.env.WHATSAPP_MOCK_MODE = 'false';
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ messages: [{ id: 'wamid.sent123' }] }),
        });
    });
    afterEach(() => {
        global.fetch = originalFetch;
        process.env.META_ACCESS_TOKEN = originalEnvToken;
        process.env.WHATSAPP_MOCK_MODE = originalMockMode;
    });
    it('never falls back to the platform-wide META_ACCESS_TOKEN for an unconfigured tenant', async () => {
        process.env.META_ACCESS_TOKEN = 'platform-wide-secret-token';
        const app = makeApp({ creds: null, phoneRecord: { accessToken: null, metaPhoneId: null } });
        await dispatchOutboundMessage({ app, ...baseParams });
        // No real credentials were configured for this tenant, so no Graph API
        // call should ever be attempted using the platform's own token.
        expect(global.fetch).not.toHaveBeenCalled();
    });
    it('decrypts and uses the tenant-level WhatsAppCredentials access token', async () => {
        const plaintextToken = 'tenant-level-plaintext-token';
        const creds = { accessToken: encryptSecret(plaintextToken) };
        const phoneRecord = { accessToken: null, metaPhoneId: 'meta-phone-1' };
        const app = makeApp({ creds, phoneRecord });
        await dispatchOutboundMessage({ app, ...baseParams });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe(`Bearer ${plaintextToken}`);
    });
    it('prefers the per-phone access token over the tenant-level credentials', async () => {
        const creds = { accessToken: encryptSecret('tenant-level-token') };
        const phoneRecord = { accessToken: 'per-phone-token', metaPhoneId: 'meta-phone-1' };
        const app = makeApp({ creds, phoneRecord });
        await dispatchOutboundMessage({ app, ...baseParams });
        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer per-phone-token');
    });
});
//# sourceMappingURL=whatsappService.test.js.map
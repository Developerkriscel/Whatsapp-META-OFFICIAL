import { FastifyInstance } from 'fastify';
import { resolveAccessToken } from './credentialEncryption.js';
import { reserveSendSlot, releaseSendSlot } from './sendQuota.js';

/**
 * Meta errors that mean "try again", as opposed to "this will never work".
 *
 * Retrying a template or recipient problem just burns the same failure N times;
 * retrying a rate limit or a transient outage is the difference between a
 * recipient being delivered and being permanently marked failed over a blip.
 * With no retries at all, a one-second wobble during a large campaign
 * permanently lost every recipient in flight at that moment.
 */
const RETRYABLE_META_CODES = new Set([
  130429, // rate limit hit
  131056, // (business, consumer) pair rate limit hit
  133016, // temporarily unavailable / too many requests
  368,    // temporarily blocked for policies — clears on its own
  1,      // unknown/transient API error
  2,      // service temporarily unavailable
]);

/** Codes that specifically mean we are going too fast, so the caller should ease off. */
const RATE_LIMIT_META_CODES = new Set([130429, 131056, 133016]);

const MAX_SEND_ATTEMPTS = 3;

function isRetryable(httpStatus: number, metaCode?: number): boolean {
  if (httpStatus === 429) return true;
  if (httpStatus >= 500) return true;
  if (metaCode != null && RETRYABLE_META_CODES.has(metaCode)) return true;
  return false;
}

/** Exponential backoff with jitter, so retries from a batch don't resynchronise. */
function backoffMs(attempt: number): number {
  const base = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
  return base + Math.floor(Math.random() * 250);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DispatchMessageParams {
  app: FastifyInstance;
  messageId: string;
  tenantId: string;
  contactPhone: string;
  phoneNumberId: string;
  body: string;
  type?: 'text' | 'template' | 'media';
  // Required when type === 'media'. Meta fetches the URL from its own servers,
  // so it has to be publicly reachable — a localhost or signed-expiring URL
  // fails at send time rather than at upload.
  media?: {
    kind: 'image' | 'video' | 'document' | 'audio';
    link: string;
    caption?: string;
    filename?: string;
  };
  // Required when type === 'template'. components should already carry any
  // {{n}} variable substitutions (Meta rejects a bare "text" key on a
  // component — variables must go through a "parameters" array).
  template?: {
    name: string;
    language: string;
    components: any[];
  };
}

/**
 * Dispatches an outbound WhatsApp message to Meta Cloud API.
 * Uses tenant credentials if available, falling back to server environment configuration.
 * Updates message status in database to SENT or FAILED.
 */
export async function dispatchOutboundMessage(params: DispatchMessageParams): Promise<any> {
  const { app, messageId, tenantId, contactPhone, phoneNumberId, body, type, template, media } = params;

  // Tracked so a throw between reserving and completing the send (a network
  // error mid-fetch, say) doesn't permanently consume quota.
  let slotReserved = false;

  try {
    // 1. Fetch Tenant's WhatsApp Credentials & Phone Number Record
    const [creds, phoneRecord] = await Promise.all([
      app.prisma.whatsAppCredentials.findUnique({ where: { tenantId } }),
      app.prisma.phoneNumber.findFirst({ where: { id: phoneNumberId, tenantId } }),
    ]);

    // Tenant-scoped credentials only - never fall back to the platform's own
    // META_ACCESS_TOKEN env var here, or an unconfigured tenant could send
    // messages under the platform's identity/quota.
    const token = resolveAccessToken(phoneRecord?.accessToken, creds?.accessToken);
    const metaPhoneId = phoneRecord?.metaPhoneId || null;

    // Format phone number to clean E.164 without leading '+' for Meta API
    const formattedTo = contactPhone.replace(/[^\d]/g, '');

    const isMock = process.env.WHATSAPP_MOCK_MODE === 'true';

    // 2. If real Meta credentials & phone ID are available, invoke Meta Graph API
    if (token && metaPhoneId && !isMock) {
      // Claim a slot against this number's daily quota before calling Meta.
      // Reserving up front (rather than counting successes afterwards) is what
      // keeps a parallel campaign batch from collectively blowing past the cap.
      const slot = await reserveSendSlot(app.prisma, phoneNumberId);
      if (!slot.allowed) {
        const updated = await app.prisma.message.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            errorCode: 'DAILY_LIMIT_REACHED',
            errorMessage: slot.reason || 'Daily send limit reached',
            failedAt: new Date(),
          },
        });
        return { success: false, status: 'FAILED', error: slot.reason, data: updated };
      }
      slotReserved = true;

      const url = `https://graph.facebook.com/v18.0/${metaPhoneId}/messages`;
      const payload =
        type === 'media' && media
          ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedTo,
              type: media.kind,
              [media.kind]: {
                link: media.link,
                // Audio takes neither a caption nor a filename; documents are
                // the only kind that shows a filename to the recipient.
                ...(media.kind !== 'audio' && media.caption ? { caption: media.caption } : {}),
                ...(media.kind === 'document' && media.filename ? { filename: media.filename } : {}),
              },
            }
          : type === 'template' && template
          ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedTo,
              type: 'template',
              template: {
                name: template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                language: { code: template.language },
                // Omit `components` entirely when there are no parameters,
                // which is the shape Meta's own docs use for a template with no
                // variables. Meta does also accept an empty array -- verified
                // against the live API -- so this is tidiness, not a fix.
                ...(template.components && template.components.length > 0
                  ? { components: template.components }
                  : {}),
              },
            }
          : {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: formattedTo,
              type: 'text',
              text: { body },
            };

      // Retry transient failures. Without this a momentary rate limit or a 5xx
      // permanently failed that recipient, which during a large campaign meant
      // losing everything in flight at that instant.
      let response!: Response;
      let responseData: any;
      let rateLimited = false;

      for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          responseData = await response.json();
        } catch (netErr: any) {
          // Never reached Meta at all. Treat like a 503 and try again.
          if (attempt < MAX_SEND_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw netErr;
        }

        const metaCode: number | undefined = responseData?.error?.code;
        if (metaCode != null && RATE_LIMIT_META_CODES.has(metaCode)) rateLimited = true;

        if (response.ok || !isRetryable(response.status, metaCode) || attempt === MAX_SEND_ATTEMPTS) {
          break;
        }

        // Meta asks for a longer pause on rate limits than on a plain 5xx.
        await sleep(rateLimited ? backoffMs(attempt) * 4 : backoffMs(attempt));
      }

      if (response.ok && responseData?.messages?.[0]?.id) {
        const metaMessageId = responseData.messages[0].id;
        const updated = await app.prisma.message.update({
          where: { id: messageId },
          data: {
            status: 'SENT',
            metaMessageId,
            sentAt: new Date(),
          },
        });
        return { success: true, status: 'SENT', metaMessageId, data: updated };
      } else {
        // Meta's top-level `message` is often the generic headline -- 132018 is
        // literally "There's an issue with the parameters in your template",
        // which says nothing about which parameter or why. The specific reason
        // lives in error_data.details, and dropping it is what made these
        // failures impossible to diagnose from the campaign view.
        const metaError = responseData?.error;
        const details: string | undefined = metaError?.error_data?.details;
        const headline: string = metaError?.message || responseData?.message || 'Meta API call failed';
        const errMessage = details ? `${headline} — ${details}` : headline;
        const errCode = metaError?.code?.toString() || 'META_API_ERROR';

        if (details) {
          console.error(`[Meta ${errCode}] ${details}`);
        }

        // Meta didn't accept it, so it shouldn't count against the day's quota.
        await releaseSendSlot(app.prisma, phoneNumberId);
        slotReserved = false;

        const updated = await app.prisma.message.update({
          where: { id: messageId },
          data: {
            status: 'FAILED',
            errorCode: errCode,
            errorMessage: errMessage,
            failedAt: new Date(),
          },
        });
        // rateLimited tells the campaign loop to ease off rather than keep
        // pushing at the same rate, which is what turns one throttle into a
        // whole batch of throttled failures.
        return { success: false, status: 'FAILED', error: errMessage, errorCode: errCode, rateLimited, data: updated };
      }
    }

    // 3. Fallback / Mock Mode: Simulate immediate dispatch for testing environments
    const mockMetaId = `wamid.mock.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    const updated = await app.prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        metaMessageId: mockMetaId,
        sentAt: new Date(),
      },
    });

    return { success: true, status: 'SENT', metaMessageId: mockMetaId, data: updated };
  } catch (err: any) {
    const errMessage = err?.message || 'Unknown dispatch error';

    // The send never completed, so give the quota slot back.
    if (slotReserved) {
      await releaseSendSlot(app.prisma, phoneNumberId);
    }

    await app.prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        errorMessage: errMessage,
        failedAt: new Date(),
      },
    }).catch(() => {});

    return { success: false, status: 'FAILED', error: errMessage };
  }
}

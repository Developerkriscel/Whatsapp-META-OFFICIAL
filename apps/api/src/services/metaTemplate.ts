/**
 * Meta WhatsApp Template Service
 * Handles template lifecycle: Draft → Submit → Meta Review → Approved/Rejected
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { decryptSecret } from './credentialEncryption.js';

export interface MetaTemplate {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DELETED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: MetaTemplateComponent[];
  quality_score?: { score: string; date?: number } | null;
  created_at: string;
  updated_at: string;
}

export interface MetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: { header_text?: string[]; body_text?: string[][] };
  buttons?: MetaTemplateButton[];
}

export interface MetaTemplateButton {
  type: 'PHONE_NUMBER' | 'URL' | 'COPY_CODE' | 'OTP';
  text: string;
  phone_number?: string;
  url?: string;
  example?: string[];
}

/**
 * Fetch templates from Meta Graph API
 */
export async function fetchMetaTemplates(
  accessToken: string,
  wabaId: string
): Promise<MetaTemplate[]> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${wabaId}/message_templates`,
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,status,category,language,components,quality_score,created_at,updated_at',
        },
      }
    );

    return response.data?.data || [];
  } catch (error: any) {
    console.error('Failed to fetch Meta templates:', error.message);
    throw new Error(`Failed to fetch templates: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get single template from Meta
 */
export async function getMetaTemplate(
  accessToken: string,
  wabaId: string,
  templateId: string
): Promise<MetaTemplate | null> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${templateId}`,
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,status,category,language,components,quality_score,created_at,updated_at',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw new Error(`Failed to fetch template: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Check that a token can actually manage templates on a WABA.
 *
 * A token can be perfectly valid for its app and still be unable to reach the
 * WABA it was saved with (a different business, or a system user never
 * assigned to it). Nothing caught that until a template submission failed
 * with Meta's "Object with ID ... does not exist".
 *
 * `reachable: false` means Meta itself could not be reached, so callers should
 * not treat it as proof that the credentials are wrong.
 */
export async function checkWabaAccess(
  accessToken: string,
  wabaId: string
): Promise<{ ok: true; name: string | null } | { ok: false; reachable: boolean; message: string }> {
  try {
    const waba = await axios.get(`https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}`, {
      params: { access_token: accessToken, fields: 'id,name' },
    });
    // Reading the WABA only needs it to be visible; the template edge is what
    // submission actually uses, and it needs whatsapp_business_management.
    await axios.get(`https://graph.facebook.com/v25.0/${encodeURIComponent(wabaId)}/message_templates`, {
      params: { access_token: accessToken, limit: 1, fields: 'id' },
    });
    return { ok: true, name: waba.data?.name ?? null };
  } catch (error: any) {
    const err = error.response?.data?.error;
    if (!error.response) {
      return { ok: false, reachable: false, message: 'Could not reach Meta to check the WhatsApp Business Account.' };
    }
    if (err?.code === 190) {
      return { ok: false, reachable: true, message: 'The access token is invalid or has expired. Generate a new one in Meta Business Settings.' };
    }
    if (err?.code === 100 || err?.code === 10 || err?.code === 200) {
      return {
        ok: false,
        reachable: true,
        message:
          `This access token cannot access WhatsApp Business Account ${wabaId}. Check the WABA ID in WhatsApp Manager, ` +
          'and make sure the token has the whatsapp_business_management permission and its system user is assigned to this account.',
      };
    }
    return { ok: false, reachable: true, message: err?.message || error.message };
  }
}

/**
 * Pick the access token to use for template calls on a WABA.
 *
 * A tenant can hold more than one token: each phone number may carry its own,
 * and the tenant credentials carry another. Sending messages already prefers
 * the phone's token, but template calls only ever used the credentials token,
 * so templates failed with "Object with ID ... does not exist" whenever that
 * token could not reach the WABA, even though messages from the same WABA
 * were going out fine on the phone's token. Which token ended up in the
 * credentials changed as numbers and credentials were saved, which is why the
 * failure came and went.
 *
 * Tries the phone tokens for this WABA first, then the credentials token, and
 * returns the first one Meta confirms can manage templates. If none can, or
 * Meta cannot be reached to check, returns the first candidate so the real
 * error still surfaces.
 */
export async function resolveWabaToken(
  prisma: PrismaClient,
  tenantId: string,
  wabaId: string,
  credentialsToken?: string | null
): Promise<string | null> {
  const phones = await prisma.phoneNumber.findMany({
    where: { tenantId, wabaId, accessToken: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true },
  });

  const candidates: string[] = [];
  for (const stored of [...phones.map((p) => p.accessToken), credentialsToken]) {
    if (!stored) continue;
    try {
      const token = decryptSecret(stored);
      if (token && !candidates.includes(token)) candidates.push(token);
    } catch {
      // A token that no longer decrypts cannot be used; try the next one.
    }
  }
  if (candidates.length <= 1) return candidates[0] ?? null;

  for (const token of candidates) {
    const access = await checkWabaAccess(token, wabaId);
    if (access.ok) return token;
    if (!access.reachable) break;
  }
  return candidates[0];
}

/**
 * Map a Meta template status onto ours. Returns null for anything we do not
 * recognise, so callers leave the stored status alone rather than guess.
 */
export function localTemplateStatus(metaStatus?: string | null): 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEPRECATED' | null {
  switch ((metaStatus || '').toUpperCase()) {
    case 'APPROVED': return 'APPROVED';
    case 'REJECTED': return 'REJECTED';
    case 'PENDING':
    case 'IN_APPEAL': return 'PENDING';
    case 'PAUSED':
    case 'DISABLED':
    case 'DELETED': return 'DEPRECATED';
    default: return null;
  }
}

const TEMPLATE_CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);

/**
 * Ask Meta for the current status of every template still marked PENDING and
 * record any change.
 *
 * Status normally arrives by webhook, but a webhook can be late, dropped, or
 * never sent, and nothing else ever looked again — so a template Meta approved
 * in seconds could sit at "Pending Review" here indefinitely. This is the
 * safety net; the webhook remains the fast path.
 */
export async function refreshPendingTemplates(prisma: PrismaClient): Promise<{ checked: number; updated: number }> {
  const pending = await prisma.template.findMany({
    where: { status: 'PENDING', metaTemplateId: { not: null } },
    select: { id: true, tenantId: true, metaTemplateId: true, phoneNumberId: true, category: true },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });

  let updated = 0;
  const tokenCache = new Map<string, string | null>();

  for (const t of pending) {
    // Meta template ids are numeric. Seeded demo rows carry placeholder ids
    // that Meta can only reject, which would log an error on every run.
    if (!/^\d+$/.test(t.metaTemplateId || '')) continue;
    try {
      const credentials = await prisma.whatsAppCredentials.findUnique({ where: { tenantId: t.tenantId } });
      const wabaId = await resolveEffectiveWabaId(prisma, t.tenantId, credentials?.wabaId, t.phoneNumberId);
      if (!wabaId) continue;

      const cacheKey = `${t.tenantId}:${wabaId}`;
      if (!tokenCache.has(cacheKey)) {
        tokenCache.set(cacheKey, await resolveWabaToken(prisma, t.tenantId, wabaId, credentials?.accessToken));
      }
      const token = tokenCache.get(cacheKey);
      if (!token) continue;

      const { data } = await axios.get(`https://graph.facebook.com/v25.0/${t.metaTemplateId}`, {
        params: { access_token: token, fields: 'status,category,rejected_reason' },
      });

      const status = localTemplateStatus(data?.status);
      if (!status || status === 'PENDING') continue;

      const now = new Date();
      const category = String(data?.category || '').toUpperCase();
      await prisma.template.update({
        where: { id: t.id },
        data: {
          status,
          // Meta may move a template to another category when it approves it.
          ...(TEMPLATE_CATEGORIES.has(category) && category !== t.category ? { category: category as any } : {}),
          rejectionReason: status === 'REJECTED' ? (data?.rejected_reason && data.rejected_reason !== 'NONE' ? data.rejected_reason : null) : null,
          approvedAt: status === 'APPROVED' ? now : undefined,
          rejectedAt: status === 'REJECTED' ? now : undefined,
        },
      });
      updated++;
    } catch (error: any) {
      // One template failing (deleted at Meta, token gone) must not stop the rest.
      console.error(`[Templates] status check failed for ${t.metaTemplateId}:`, error.response?.data?.error?.message || error.message);
    }
  }

  return { checked: pending.length, updated };
}

/**
 * Submit template to Meta for review
 */
export async function submitTemplateToMeta(
  accessToken: string,
  wabaId: string,
  template: {
    name: string;
    category: string;
    language: string;
    components: MetaTemplateComponent[];
  }
): Promise<{ id: string; status: string; category?: string }> {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${wabaId}/message_templates`,
      {
        name: template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category: template.category,
        language: template.language,
        components: template.components,
      },
      {
        params: { access_token: accessToken },
      }
    );

    return {
      id: response.data.id,
      status: response.data.status,
      category: response.data.category,
    };
  } catch (error: any) {
    const err = error.response?.data?.error;
    console.error('Failed to submit template to Meta:', error.response?.data);
    // Code 100 / subcode 33 means the token cannot reach this WABA at all —
    // nothing about the template is wrong. Meta's wording points at the Graph
    // API docs, which leaves the user with no idea that the fix is reconnecting.
    if (err?.code === 100 && err?.error_subcode === 33) {
      throw new Error(
        `Meta could not access WhatsApp Business Account ${wabaId} with the saved access token. ` +
        'Reconnect WhatsApp in Settings, or make sure the token has the whatsapp_business_management ' +
        'permission and its system user is assigned to this WhatsApp Business Account.'
      );
    }
    // Meta's top-level `message` for a rejected template is the useless
    // "Invalid parameter". What is actually wrong is in error_user_msg, and
    // discarding it left the UI showing a bare 400 with nothing to act on.
    const detail = err?.error_user_msg || err?.error_user_title || err?.message || error.message;
    throw new Error(`Failed to submit template: ${detail}`);
  }
}

/**
 * Meta's formatting rules for a template body, checked before submitting.
 *
 * These are documented rules with fixed thresholds, so failing them is
 * predictable — there is no reason to spend a round trip and an opaque
 * "Invalid parameter" to discover a blank line.
 */
export interface BodyIssue {
  code: string;
  message: string;
  fixable: boolean;
}

export function checkTemplateBody(text: string): BodyIssue[] {
  const issues: BodyIssue[] = [];

  // More than two consecutive newlines. Easy to introduce by pasting, and
  // invisible in a textarea.
  const runs = text.match(/\n{3,}/g);
  if (runs) {
    const worst = Math.max(...runs.map((r) => r.length));
    issues.push({
      code: 'CONSECUTIVE_NEWLINES',
      message: `${runs.length} place${runs.length === 1 ? '' : 's'} with ${worst} blank lines in a row. Meta allows at most two.`,
      fixable: true,
    });
  }

  const emojis = text.match(/\p{Extended_Pictographic}/gu);
  if (emojis && emojis.length > 10) {
    issues.push({
      code: 'TOO_MANY_EMOJIS',
      message: `${emojis.length} emojis. Meta allows at most 10.`,
      fixable: false,
    });
  }

  // A body that is nothing but variables is rejected.
  const withoutVars = text.replace(/\{\{\s*\d+\s*\}\}/g, '').trim();
  if (text.trim() && withoutVars === '') {
    issues.push({
      code: 'ONLY_PARAMETERS',
      message: 'The body is only variables. Meta needs some literal text around them.',
      fixable: false,
    });
  }

  if (text.length > 1024) {
    issues.push({
      code: 'TOO_LONG',
      message: `${text.length} characters. Meta allows 1024.`,
      fixable: false,
    });
  }

  return issues;
}

/** Collapses runs of blank lines to the two Meta permits. */
export function normaliseTemplateBody(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/** Meta's header formats that carry a file rather than text. */
export const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type MediaHeaderFormat = (typeof MEDIA_HEADER_FORMATS)[number];

/**
 * Uploads a sample file to Meta and returns a `header_handle`.
 *
 * A template with an image/video/document header cannot be created by pointing
 * Meta at a URL. Meta wants a sample of the media so a human reviewer can see
 * what the header will look like, and it only accepts that sample through the
 * Resumable Upload API, which hands back an opaque handle. That handle is what
 * goes in the HEADER component's `example.header_handle`.
 *
 * Two calls: open a session describing the file, then send the bytes.
 */
export async function uploadTemplateHeaderSample(
  accessToken: string,
  appId: string,
  file: { buffer: Buffer; mimeType: string; fileName: string }
): Promise<string> {
  const api = 'https://graph.facebook.com/v25.0';

  let sessionId: string;
  try {
    const session = await axios.post(
      `${api}/${appId}/uploads`,
      null,
      {
        params: {
          file_name: file.fileName,
          file_length: file.buffer.length,
          file_type: file.mimeType,
          access_token: accessToken,
        },
      }
    );
    sessionId = session.data?.id;
    if (!sessionId) throw new Error('Meta did not return an upload session id');
  } catch (error: any) {
    const detail = error.response?.data?.error?.message || error.message;
    throw new Error(`Could not start the sample upload with Meta: ${detail}`);
  }

  try {
    const upload = await axios.post(`${api}/${sessionId}`, file.buffer, {
      headers: {
        // This leg authenticates with the "OAuth <token>" scheme rather than a
        // Bearer header or an access_token param -- the resumable upload
        // endpoint rejects the other two.
        Authorization: `OAuth ${accessToken}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const handle = upload.data?.h;
    if (!handle) throw new Error('Meta accepted the upload but returned no handle');
    return handle;
  } catch (error: any) {
    const detail = error.response?.data?.error?.message || error.message;
    throw new Error(`Could not upload the sample to Meta: ${detail}`);
  }
}

/**
 * Delete template from Meta
 */
export async function deleteMetaTemplate(
  accessToken: string,
  templateId: string
): Promise<boolean> {
  try {
    await axios.delete(
      `https://graph.facebook.com/v25.0/${templateId}`,
      {
        params: { access_token: accessToken },
      }
    );
    return true;
  } catch (error: any) {
    console.error('Failed to delete Meta template:', error.message);
    return false;
  }
}

/**
 * The connected phone number's own wabaId is the source of truth for which
 * WABA can actually send — it's stamped atomically with the phone number
 * itself by the connect flow. WhatsAppCredentials.wabaId is a separate,
 * independently-editable field (e.g. the manual credentials-entry form) that
 * can drift out of sync with it — which is exactly what happened here: a
 * tenant's templates were being submitted/synced against a stale WABA that
 * had nothing to do with their actually-connected number, so template
 * status never matched reality and "approved" templates looked stuck.
 * Always prefer the phone number's wabaId when one is connected.
 *
 * When a tenant has numbers on more than one WABA, `explicitPhoneNumberId`
 * (e.g. a template's own stored `phoneNumberId`, or a caller-supplied
 * selection) picks exactly which one to use — falling back to the
 * most-recently-updated connected number only when nothing more specific
 * was given, which is the correct, unambiguous choice for the common
 * single-number case.
 */
export async function resolveEffectiveWabaId(
  prisma: PrismaClient,
  tenantId: string,
  storedWabaId?: string | null,
  explicitPhoneNumberId?: string | null
): Promise<string | null> {
  if (explicitPhoneNumberId) {
    const explicitPhone = await prisma.phoneNumber.findFirst({
      where: { id: explicitPhoneNumberId, tenantId },
      select: { wabaId: true },
    });
    if (explicitPhone?.wabaId) return explicitPhone.wabaId;
  }

  const phone = await prisma.phoneNumber.findFirst({
    where: { tenantId, wabaId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { wabaId: true },
  });
  return phone?.wabaId || storedWabaId || null;
}

/**
 * Sync templates from Meta to local database
 */
export async function syncTemplatesFromMeta(
  prisma: PrismaClient,
  tenantId: string,
  explicitPhoneNumberId?: string | null
): Promise<{ synced: number; updated: number; errors: string[] }> {
  // Get tenant's WhatsApp credentials
  const credentials = await prisma.whatsAppCredentials.findUnique({
    where: { tenantId },
  });

  const wabaId = await resolveEffectiveWabaId(prisma, tenantId, credentials?.wabaId, explicitPhoneNumberId);

  const token = wabaId ? await resolveWabaToken(prisma, tenantId, wabaId, credentials?.accessToken) : null;
  if (!token || !wabaId) {
    throw new Error('WhatsApp not connected. Please connect your WhatsApp Business Account first.');
  }

  // Fetch templates from Meta
  const metaTemplates = await fetchMetaTemplates(token, wabaId);

  // Stamp every synced template with the phone number that actually owns
  // this WABA, so future submissions/re-syncs for a multi-number tenant
  // know unambiguously which number's WABA each template belongs to.
  const owningPhone = await prisma.phoneNumber.findFirst({
    where: { tenantId, wabaId },
    select: { id: true },
  });

  let synced = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const metaTpl of metaTemplates) {
    try {
      // Find existing template
      const existing = await prisma.template.findFirst({
        where: {
          tenantId,
          metaTemplateId: metaTpl.id,
        },
      });

      // Map Meta status to our status
      const statusMap: Record<string, string> = {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        PAUSED: 'DEPRECATED',
        DELETED: 'DEPRECATED',
      };

      const components = metaTpl.components || [];
      const header = components.find((c) => c.type === 'HEADER') || null;
      const body = components.find((c) => c.type === 'BODY') || { type: 'BODY', text: '' };
      const footer = components.find((c) => c.type === 'FOOTER') || null;
      const buttonsComponent = components.find((c) => c.type === 'BUTTONS');

      const templateData = {
        metaTemplateId: metaTpl.id,
        status: (statusMap[metaTpl.status] || 'PENDING') as any,
        category: metaTpl.category as any,
        language: metaTpl.language,
        header: header as any,
        body: body as any,
        footer: footer as any,
        buttons: (buttonsComponent?.buttons as any) || undefined,
        // qualityScore is a String? column — Meta returns an object
        // ({score, date}); store just the score. Passing the raw object here
        // silently threw on every single sync (caught into the errors array),
        // so template status/rejection-reason sync from Meta never actually
        // persisted for any template that had a quality score set.
        qualityScore: metaTpl.quality_score?.score ?? null,
        phoneNumberId: owningPhone?.id,
      };

      if (existing) {
        await prisma.template.update({
          where: { id: existing.id },
          data: templateData,
        });
        updated++;
      } else {
        await prisma.template.create({
          data: {
            ...templateData,
            tenantId,
            name: metaTpl.name,
          },
        });
        synced++;
      }
    } catch (err: any) {
      errors.push(`Template ${metaTpl.name}: ${err.message}`);
    }
  }

  return { synced, updated, errors };
}

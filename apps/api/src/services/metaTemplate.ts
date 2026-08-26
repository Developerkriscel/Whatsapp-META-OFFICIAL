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
      `https://graph.facebook.com/v18.0/${wabaId}/message_templates`,
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
      `https://graph.facebook.com/v18.0/${templateId}`,
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
): Promise<{ id: string; status: string }> {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${wabaId}/message_templates`,
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
    };
  } catch (error: any) {
    console.error('Failed to submit template to Meta:', error.response?.data);
    throw new Error(`Failed to submit template: ${error.response?.data?.error?.message || error.message}`);
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
      `https://graph.facebook.com/v18.0/${templateId}`,
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

  if (!credentials?.accessToken || !wabaId) {
    throw new Error('WhatsApp not connected. Please connect your WhatsApp Business Account first.');
  }

  // Fetch templates from Meta
  const metaTemplates = await fetchMetaTemplates(
    decryptSecret(credentials.accessToken),
    wabaId
  );

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

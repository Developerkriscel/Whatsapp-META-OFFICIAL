/**
 * Meta WhatsApp Template Service
 * Handles template lifecycle: Draft → Submit → Meta Review → Approved/Rejected
 */
import { PrismaClient } from '@prisma/client';
export interface MetaTemplate {
    id: string;
    name: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DELETED';
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    language: string;
    components: MetaTemplateComponent[];
    quality_score?: {
        score: string;
        date?: number;
    } | null;
    created_at: string;
    updated_at: string;
}
export interface MetaTemplateComponent {
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: {
        header_text?: string[];
        body_text?: string[][];
    };
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
export declare function fetchMetaTemplates(accessToken: string, wabaId: string): Promise<MetaTemplate[]>;
/**
 * Get single template from Meta
 */
export declare function getMetaTemplate(accessToken: string, wabaId: string, templateId: string): Promise<MetaTemplate | null>;
/**
 * Submit template to Meta for review
 */
export declare function submitTemplateToMeta(accessToken: string, wabaId: string, template: {
    name: string;
    category: string;
    language: string;
    components: MetaTemplateComponent[];
}): Promise<{
    id: string;
    status: string;
}>;
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
export declare function checkTemplateBody(text: string): BodyIssue[];
/** Collapses runs of blank lines to the two Meta permits. */
export declare function normaliseTemplateBody(text: string): string;
/** Meta's header formats that carry a file rather than text. */
export declare const MEDIA_HEADER_FORMATS: readonly ["IMAGE", "VIDEO", "DOCUMENT"];
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
export declare function uploadTemplateHeaderSample(accessToken: string, appId: string, file: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
}): Promise<string>;
/**
 * Delete template from Meta
 */
export declare function deleteMetaTemplate(accessToken: string, templateId: string): Promise<boolean>;
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
export declare function resolveEffectiveWabaId(prisma: PrismaClient, tenantId: string, storedWabaId?: string | null, explicitPhoneNumberId?: string | null): Promise<string | null>;
/**
 * Sync templates from Meta to local database
 */
export declare function syncTemplatesFromMeta(prisma: PrismaClient, tenantId: string, explicitPhoneNumberId?: string | null): Promise<{
    synced: number;
    updated: number;
    errors: string[];
}>;
//# sourceMappingURL=metaTemplate.d.ts.map
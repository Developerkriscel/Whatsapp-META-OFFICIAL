/**
 * WhatsApp Settings Routes - PER-TENANT CREDENTIALS
 * Each tenant configures their own WhatsApp Business API credentials
 * No need to modify server .env for each new client!
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import {
  getMetaAuthUrl,
  exchangeCodeForToken,
  exchangeEmbeddedSignupCode,
  getLongLivedToken,
  getWhatsAppBusinessAccounts,
  getPhoneNumbers,
  verifyPhoneNumber,
  requestPhoneVerification,
  verifyPhoneCode,
  setupWebhook,
  type MetaOAuthConfig,
} from '../services/metaOAuth.js';
import { encryptSecret, decryptSecret, decryptIfPresent, resolveAccessToken } from '../services/credentialEncryption.js';
import { resolveEffectiveWabaId } from '../services/metaTemplate.js';

/**
 * Registers a freshly connected number with Cloud API. Until this runs the
 * number exists on the WABA but cannot send anything.
 *
 * Registration also sets the number's two-step PIN, so it fails when the number
 * already carries one from an earlier setup. That is a state the customer can
 * resolve, so it is reported back rather than raised as a connection failure.
 */
async function registerPhoneWithCloudApi(
  accessToken: string,
  metaPhoneId: string,
): Promise<{ registered: boolean; message: string; pin?: string }> {
  // Random rather than fixed: this PIN guards the number against being
  // re-registered elsewhere, so a shared constant across every tenant would
  // be no protection at all.
  const pin = String(crypto.randomInt(100000, 1000000));

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    });
    const data: any = await res.json();

    if (res.ok && data?.success !== false) {
      return { registered: true, message: 'Number registered with Cloud API.', pin };
    }

    const msg: string = data?.error?.message || 'Registration failed';

    // 133005 / "two-step verification PIN" — the number already has a PIN set.
    if (/two.?step|pin/i.test(msg)) {
      return {
        registered: false,
        message:
          'The number already has a two-step verification PIN from a previous setup. ' +
          'Reset it in WhatsApp Manager, then register the number from its settings page.',
      };
    }

    return { registered: false, message: `Could not register the number automatically: ${msg}` };
  } catch (err: any) {
    return { registered: false, message: `Could not reach Meta to register the number: ${err?.message}` };
  }
}

/** Reads the quality, display-name and messaging-tier fields Meta exposes for a number. */
async function fetchPhoneMetadata(
  accessToken: string,
  metaPhoneId: string,
): Promise<{ qualityScore?: string; nameStatus?: string; messagingLimitTier?: string } | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${metaPhoneId}?fields=quality_rating,name_status,messaging_limit_tier&access_token=${accessToken}`,
    );
    if (!res.ok) return null;
    const d: any = await res.json();
    const rating = d.quality_rating?.toUpperCase();
    return {
      qualityScore: ['GREEN', 'YELLOW', 'RED'].includes(rating) ? rating : 'UNKNOWN',
      nameStatus: d.name_status ? String(d.name_status).toUpperCase() : undefined,
      messagingLimitTier: d.messaging_limit_tier ? String(d.messaging_limit_tier).toUpperCase() : undefined,
    };
  } catch {
    return null;
  }
}

export async function registerWhatsAppRoutes(app: FastifyInstance): Promise<void> {

  // ============================================
  // META OAUTH EMBEDDED SIGNUP FLOW
  // ============================================

  /**
   * GET /whatsapp/oauth/url - Get Meta OAuth URL for onboarding
   */
  app.get('/whatsapp/oauth/url', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get platform Meta credentials
    const config: MetaOAuthConfig = {
      appId: process.env.META_APP_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      redirectUri: `${process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001'}/api/v1/whatsapp/oauth/callback`,
    };

    if (!config.appId || !config.appSecret) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'META_NOT_CONFIGURED',
          message: 'Meta App credentials not configured. Please contact support.',
        },
      });
    }

    // Generate state token for CSRF protection (contains tenant ID)
    const state = Buffer.from(JSON.stringify({
      tenantId: request.authUser.tenantId,
      userId: request.authUser.id,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64');

    const authUrl = getMetaAuthUrl(config, state);

    return { success: true, data: { authUrl, state } };
  });

  /**
   * GET /whatsapp/oauth/callback - Handle Meta OAuth callback
   */
  app.get('/whatsapp/oauth/callback', async (request, reply) => {
    const { code, state, error, error_reason } = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_reason?: string;
    };

    const frontendUrl = process.env.APP_URL || 'http://localhost:5173';

    // Handle OAuth error
    if (error) {
      return reply.redirect(`${frontendUrl}/whatsapp?error=${encodeURIComponent(error_reason || error)}`);
    }

    if (!code || !state) {
      return reply.redirect(`${frontendUrl}/whatsapp?error=missing_params`);
    }

    // Decode and validate state
    let stateData: { tenantId: string; userId: string; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return reply.redirect(`${frontendUrl}/whatsapp?error=invalid_state`);
    }

    if (!stateData.tenantId) {
      return reply.redirect(`${frontendUrl}/whatsapp?error=invalid_state`);
    }

    try {
      const config: MetaOAuthConfig = {
        appId: process.env.META_APP_ID || '',
        appSecret: process.env.META_APP_SECRET || '',
        redirectUri: `${process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001'}/api/v1/whatsapp/oauth/callback`,
      };

      // Exchange code for short-lived token
      const shortLivedToken = await exchangeCodeForToken(config, code);

      // Get long-lived token (valid for 60 days)
      const longLivedToken = await getLongLivedToken(config, shortLivedToken.access_token);

      // Get WhatsApp Business Accounts
      const wabas = await getWhatsAppBusinessAccounts(longLivedToken.access_token);

      // Store credentials and WABAs in tenant settings
      await app.prisma.whatsAppCredentials.upsert({
        where: { tenantId: stateData.tenantId },
        create: {
          tenantId: stateData.tenantId,
          accessToken: encryptSecret(longLivedToken.access_token),
          // Don't store app secret directly - keep in env
        },
        update: {
          accessToken: encryptSecret(longLivedToken.access_token),
        },
      });

      // Store WABAs for selection
      // Return to frontend for user to select WABA and phone number
      return reply.redirect(`${frontendUrl}/whatsapp?oauth=success&wabas=${encodeURIComponent(JSON.stringify(wabas))}`);

    } catch (err: any) {
      const graphError = err.response?.data?.error;
      app.log.error({ graphError, message: err.message }, 'Meta OAuth error');
      const displayMessage = graphError?.message || err.message;
      return reply.redirect(`${frontendUrl}/whatsapp?error=${encodeURIComponent(displayMessage)}`);
    }
  });

  /**
   * POST /whatsapp/oauth/select-waba - Select a WABA and get phone numbers
   */
  app.post('/whatsapp/oauth/select-waba', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      wabaId: z.string(),
      wabaName: z.string(),
    });

    const { wabaId, wabaName } = schema.parse(request.body);

    // Get stored access token
    const credentials = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    if (!credentials?.accessToken) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Please complete Meta OAuth first' },
      });
    }

    // Get phone numbers for selected WABA
    const phoneNumbers = await getPhoneNumbers(decryptSecret(credentials.accessToken), wabaId);

    // Store WABA info
    await app.prisma.whatsAppCredentials.update({
      where: { tenantId: request.authUser.tenantId },
      data: {
        wabaId: wabaId,
        wabaName: wabaName,
      },
    });

    return {
      success: true,
      data: {
        wabaId,
        wabaName,
        phoneNumbers,
      },
    };
  });

  /**
   * POST /whatsapp/oauth/connect-phone - Connect a specific phone number
   */
  app.post('/whatsapp/oauth/connect-phone', { preHandler: [app.requirePermission('phone_numbers', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      phoneNumberId: z.string(),
      displayName: z.string().optional(),
    });

    const { phoneNumberId, displayName } = schema.parse(request.body);

    // Get stored access token
    const credentials = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    if (!credentials?.accessToken || !credentials.wabaId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Please complete Meta OAuth first' },
      });
    }

    // Verify phone number ownership
    const decryptedToken = decryptSecret(credentials.accessToken);
    const verifiedPhone = await verifyPhoneNumber(decryptedToken, credentials.wabaId, phoneNumberId);

    if (!verifiedPhone) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VERIFICATION_FAILED', message: 'Could not verify phone number ownership' },
      });
    }

    // A retried/re-run connection (or a previously disconnected number) can already
    // have a row for this metaPhoneId — reconnect it instead of erroring on the
    // unique constraint. A row owned by a different tenant is a real conflict.
    const existingPhone = await app.prisma.phoneNumber.findUnique({ where: { metaPhoneId: phoneNumberId } });

    if (existingPhone && existingPhone.tenantId !== request.authUser.tenantId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'DUPLICATE', message: 'This phone number is already connected to another workspace' },
      });
    }

    const phoneData = {
      tenantId: request.authUser.tenantId,
      phoneNumber: verifiedPhone.display_phone_number,
      displayName: displayName || verifiedPhone.verified_name,
      metaPhoneId: phoneNumberId,
      wabaId: credentials.wabaId,
      status: 'connected',
      canSendMarketing: true,
      canSendUtility: true,
      canSendAuth: true,
    };

    const phone = existingPhone
      ? await app.prisma.phoneNumber.update({ where: { id: existingPhone.id }, data: phoneData })
      : await app.prisma.phoneNumber.create({ data: phoneData });

    // Setup webhook for this WABA
    await setupWebhook(
      decryptedToken,
      credentials.wabaId,
      `${process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001'}/webhook`,
      process.env.META_WEBHOOK_VERIFY_TOKEN || 'whatsapp_webhook_verify_token'
    );

    return {
      success: true,
      data: phone,
      message: 'Phone number connected successfully!',
    };
  });

  /**
   * GET /whatsapp/embedded-signup/config - Public config the frontend needs to
   * launch Meta's Embedded Signup JS SDK popup (App ID + Signup Configuration ID).
   */
  app.get('/whatsapp/embedded-signup/config', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const appId = process.env.META_APP_ID || '';
    const configId = process.env.META_SIGNUP_CONFIG_ID || '';

    if (!appId || !configId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'EMBEDDED_SIGNUP_NOT_CONFIGURED',
          message: 'Embedded Signup is not configured yet. Create a Signup Configuration in the Meta dashboard and set META_SIGNUP_CONFIG_ID.',
        },
      });
    }

    // Pre-fill what we already know about the tenant so the customer isn't
    // retyping their own business details inside Meta's popup. Only fields we
    // genuinely hold are sent — a wrong pre-filled value is worse than an empty
    // box, because the customer may not notice it before submitting.
    const [tenant, owner] = await Promise.all([
      app.prisma.tenant.findUnique({
        where: { id: request.authUser.tenantId },
        select: { name: true, website: true },
      }),
      app.prisma.user.findFirst({
        where: { tenantId: request.authUser.tenantId, role: 'OWNER' },
        select: { email: true },
      }),
    ]);

    const business: Record<string, string> = {};
    if (tenant?.name?.trim()) business.name = tenant.name.trim();
    if (owner?.email) business.email = owner.email;

    // Only pass a website Meta will accept. Stored values are user-entered and
    // not always well formed — one tenant has "https:www.kriscel.com", missing
    // the slashes — and a malformed prefill fails validation inside the popup,
    // which is harder for the customer to diagnose than an empty field.
    if (tenant?.website) {
      try {
        const u = new URL(tenant.website.trim());
        if (u.protocol === 'http:' || u.protocol === 'https:') business.website = u.toString();
      } catch {
        // Not a usable URL — leave it out.
      }
    }

    const prefill = Object.keys(business).length > 0 ? { business } : undefined;

    // Meta's own hosted onboarding page for the same configuration. The popup
    // needs Advanced Access on business_management before it works for accounts
    // without a role on the app; this page runs the flow on Meta's side, so it
    // works for anyone today. Handing both to the client lets the UI fall back
    // instead of dead-ending on "Feature unavailable".
    const extras = encodeURIComponent(JSON.stringify({ sessionInfoVersion: '3', version: 'v4' }));
    const hostedSignupUrl =
      `https://business.facebook.com/messaging/whatsapp/onboard/` +
      `?app_id=${appId}&config_id=${configId}&extras=${extras}`;

    return {
      success: true,
      data: { appId, configId, graphApiVersion: 'v21.0', hostedSignupUrl, prefill },
    };
  });

  /**
   * POST /whatsapp/embedded-signup/complete - Finalize Meta's Embedded Signup flow.
   * The frontend JS SDK popup handles WABA creation/selection and phone verification
   * itself; it hands back a `code` (via FB.login) plus wabaId/phoneNumberId/businessId
   * (via postMessage). This endpoint exchanges the code and persists the connection.
   */
  app.post('/whatsapp/embedded-signup/complete', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      code: z.string(),
      wabaId: z.string(),
      phoneNumberId: z.string(),
      businessId: z.string().optional(),
    });

    const { code, wabaId, phoneNumberId, businessId } = schema.parse(request.body);

    const config: MetaOAuthConfig = {
      appId: process.env.META_APP_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      redirectUri: '',
    };

    if (!config.appId || !config.appSecret) {
      return reply.status(400).send({
        success: false,
        error: { code: 'META_NOT_CONFIGURED', message: 'Meta App credentials not configured. Please contact support.' },
      });
    }

    try {
      const shortLivedToken = await exchangeEmbeddedSignupCode(config, code);
      const longLivedToken = await getLongLivedToken(config, shortLivedToken.access_token);
      const accessToken = longLivedToken.access_token;

      const verifiedPhone = await verifyPhoneNumber(accessToken, wabaId, phoneNumberId);
      if (!verifiedPhone) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VERIFICATION_FAILED', message: 'Could not verify the connected phone number' },
        });
      }

      await app.prisma.whatsAppCredentials.upsert({
        where: { tenantId: request.authUser.tenantId },
        create: {
          tenantId: request.authUser.tenantId,
          accessToken: encryptSecret(accessToken),
          wabaId,
          businessId,
          isConfigured: true,
        },
        update: {
          accessToken: encryptSecret(accessToken),
          wabaId,
          businessId,
          isConfigured: true,
        },
      });

      const existingPhone = await app.prisma.phoneNumber.findUnique({ where: { metaPhoneId: phoneNumberId } });
      const phone = existingPhone
        ? await app.prisma.phoneNumber.update({
            where: { id: existingPhone.id },
            data: {
              phoneNumber: verifiedPhone.display_phone_number,
              displayName: verifiedPhone.verified_name,
              wabaId,
              status: 'connected',
            },
          })
        : await app.prisma.phoneNumber.create({
            data: {
              tenantId: request.authUser.tenantId,
              phoneNumber: verifiedPhone.display_phone_number,
              displayName: verifiedPhone.verified_name,
              metaPhoneId: phoneNumberId,
              wabaId,
              status: 'connected',
              canSendMarketing: true,
              canSendUtility: true,
              canSendAuth: true,
            },
          });

      await setupWebhook(
        accessToken,
        wabaId,
        `${process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001'}/webhook`,
        process.env.META_WEBHOOK_VERIFY_TOKEN || 'whatsapp_webhook_verify_token'
      );

      // A number that finished Embedded Signup still cannot send until it is
      // registered with Cloud API. Doing it here means the customer is ready
      // immediately, instead of connecting successfully and then failing on
      // their first send with an opaque Meta error.
      //
      // Registration sets the two-step PIN, so it fails if the number already
      // has one from a previous setup. That is recoverable by the customer, so
      // it is reported rather than treated as a failed connection.
      const registration = await registerPhoneWithCloudApi(accessToken, phoneNumberId);

      // Capture the metadata the panel needs, so the number shows real values
      // straight away rather than after a manual refresh.
      const meta = await fetchPhoneMetadata(accessToken, phoneNumberId);
      if (meta) {
        await app.prisma.phoneNumber.update({
          where: { id: phone.id },
          data: {
            ...(meta.qualityScore ? { qualityScore: meta.qualityScore } : {}),
            ...(meta.nameStatus ? { nameStatus: meta.nameStatus } : {}),
            ...(meta.messagingLimitTier
              ? { messagingLimitTier: meta.messagingLimitTier, messagingTierFetchedAt: new Date() }
              : {}),
            ...(registration.registered ? { status: 'verified' } : {}),
          },
        });
      }

      return {
        success: true,
        data: { ...phone, registration },
        message: registration.registered
          ? 'WhatsApp connected and the number is ready to send.'
          : `WhatsApp connected. ${registration.message}`,
      };
    } catch (err: any) {
      app.log.error('Embedded signup completion error:', err.response?.data || err.message);
      return reply.status(400).send({
        success: false,
        error: {
          code: 'EMBEDDED_SIGNUP_FAILED',
          message: err.response?.data?.error?.message || 'Failed to complete WhatsApp connection',
        },
      });
    }
  });

  // ============================================
  // WHATSAPP HEALTH CENTER - Connection Status Overview
  // ============================================

  /**
   * GET /whatsapp/health - Get WhatsApp connection health status
   */
  app.get('/whatsapp/health', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get credentials
    const credentials = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    // Get all phone numbers with usage stats
    const phoneNumbers = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    // Calculate health metrics
    const connectedCount = phoneNumbers.filter(p => p.status === 'connected').length;
    const disconnectedCount = phoneNumbers.filter(p => p.status === 'disconnected').length;

    // Get token expiry info (estimate from stored token)
    const tokenStatus = credentials?.accessToken
      ? { isValid: true, hasToken: true }
      : { isValid: false, hasToken: false, needsReauth: true };

    // Get recent webhook activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentWebhookActivity = await app.prisma.webhookLog.count({
      where: {
        tenantId: request.authUser.tenantId,
        createdAt: { gte: last24Hours },
      },
    });

    return {
      success: true,
      data: {
        overall: {
          connected: connectedCount,
          disconnected: disconnectedCount,
          total: phoneNumbers.length,
          healthScore: phoneNumbers.length > 0
            ? Math.round((connectedCount / phoneNumbers.length) * 100)
            : 0,
        },
        credentials: {
          hasToken: !!credentials?.accessToken,
          tokenStatus: tokenStatus.isValid ? 'valid' : 'missing',
          needsReauth: tokenStatus.needsReauth,
        },
        webhook: {
          recentActivity: recentWebhookActivity,
          configured: !!credentials?.webhookUrl,
        },
        phones: phoneNumbers.map(p => ({
          id: p.id,
          phoneNumber: p.phoneNumber,
          displayName: p.displayName,
          status: p.status,
          qualityScore: p.qualityScore,
          wabaId: p.wabaId,
          metaPhoneId: p.metaPhoneId,
          verifiedAt: p.verifiedAt,
          canSendMarketing: p.canSendMarketing,
          canSendUtility: p.canSendUtility,
          canSendAuth: p.canSendAuth,
          dailySentLimit: p.dailySentLimit,
          todaySentCount: p.todaySentCount,
          messagesLast30Days: p._count.messages,
        })),
      },
    };
  });

  /**
   * GET /whatsapp/health/:phoneId - Get detailed health for specific phone
   */
  app.get('/whatsapp/health/:phoneId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneId } = z.object({ phoneId: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneId, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get message stats for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await app.prisma.message.findMany({
      where: {
        phoneNumberId: phoneId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { status: true, createdAt: true },
    });

    // Calculate delivery metrics
    const sent = messages.filter(m => m.status === 'SENT').length;
    const delivered = messages.filter(m => m.status === 'DELIVERED').length;
    const read = messages.filter(m => m.status === 'READ').length;
    const failed = messages.filter(m => m.status === 'FAILED').length;

    // Get last webhook received
    const lastWebhook = await app.prisma.webhookLog.findFirst({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // Get quality trends (if available)
    const qualityHistory = await app.prisma.phoneNumberQualityLog.findMany({
      where: { phoneNumberId: phoneId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return {
      success: true,
      data: {
        phone: {
          id: phone.id,
          phoneNumber: phone.phoneNumber,
          displayName: phone.displayName,
          status: phone.status,
          qualityScore: phone.qualityScore,
          verifiedAt: phone.verifiedAt,
          canSendMarketing: phone.canSendMarketing,
          canSendUtility: phone.canSendUtility,
          canSendAuth: phone.canSendAuth,
        },
        metrics: {
          last30Days: {
            totalSent: messages.length,
            delivered,
            read,
            failed,
            deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
            readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
          },
          limits: {
            dailyLimit: phone.dailySentLimit,
            todaySent: phone.todaySentCount,
            remaining: phone.dailySentLimit - phone.todaySentCount,
          },
        },
        webhook: {
          lastReceived: lastWebhook?.createdAt || null,
          lastEventType: lastWebhook?.event || null,
        },
        qualityHistory,
      },
    };
  });

  // ============================================
  // WEBHOOK LOGS - Developer Webhook Debugging UI
  // ============================================

  /**
   * GET /whatsapp/webhook-logs - Get webhook activity logs
   */
  app.get('/whatsapp/webhook-logs', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const query = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      phoneId: z.string().optional(),
      eventType: z.string().optional(),
      status: z.string().optional(),
    }).parse(request.query);

    const { page, limit, phoneId, eventType, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: request.authUser.tenantId };
    if (phoneId) where.phoneNumberId = phoneId;
    if (eventType) where.event = eventType;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      app.prisma.webhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      app.prisma.webhookLog.count({ where }),
    ]);

    return {
      success: true,
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ============================================
  // GET /whatsapp/phone-numbers — List tenant's phone numbers
  // ============================================
  app.get('/whatsapp/phone-numbers', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { search, status, quality } = request.query as { search?: string; status?: string; quality?: string };

    const where: any = { tenantId: request.authUser.tenantId };
    if (status) where.status = status;
    if (quality) where.qualityScore = quality;
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const phoneNumbers = await app.prisma.phoneNumber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: phoneNumbers };
  });

  // ============================================
  // POST /whatsapp/phone-numbers — Add a phone number with validation
  // ============================================
  app.post('/whatsapp/phone-numbers', { preHandler: [app.requirePermission('phone_numbers', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      phoneNumber: z.string()
        .min(10, 'Phone number too short')
        .max(20, 'Phone number too long')
        .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format (use E.164 format: +1234567890)'),
      displayName: z.string().min(1).max(30, 'Display name must be 30 characters or less').optional(),
      metaPhoneId: z.string().optional(),
    });

    const body = schema.parse(request.body);

    // Check for duplicate phone number within tenant
    const existing = await app.prisma.phoneNumber.findFirst({
      where: { tenantId: request.authUser.tenantId, phoneNumber: body.phoneNumber },
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE', message: 'This phone number is already connected' },
      });
    }

    // Check phone number limit based on plan
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: request.authUser.tenantId },
      include: { plan: true },
    });

    const currentCount = await app.prisma.phoneNumber.count({
      where: { tenantId: request.authUser.tenantId },
    });

    // For demo, allow up to 5 phone numbers
    const maxPhones = tenant?.plan?.tier === 'ENTERPRISE' ? 50 :
                      tenant?.plan?.tier === 'BUSINESS' ? 10 :
                      tenant?.plan?.tier === 'GROWTH' ? 5 : 3;

    if (currentCount >= maxPhones) {
      return reply.status(403).send({
        success: false,
        error: { code: 'LIMIT_EXCEEDED', message: `Maximum ${maxPhones} phone numbers allowed on your plan` },
      });
    }

    const phone = await app.prisma.phoneNumber.create({
      data: {
        tenantId: request.authUser.tenantId,
        phoneNumber: body.phoneNumber,
        displayName: body.displayName || null,
        metaPhoneId: body.metaPhoneId || null,
        status: body.metaPhoneId ? 'verified' : 'pending_verification',
      },
    });

    return reply.status(201).send({ success: true, data: phone });
  });

  // ============================================
  // GET /whatsapp/phone-numbers/:id — Get single phone with full details
  // ============================================
  app.get('/whatsapp/phone-numbers/:id', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get usage stats for this phone
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMessages = await app.prisma.message.count({
      where: {
        phoneNumberId: id,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    return {
      success: true,
      data: {
        ...phone,
        usageStats: {
          messagesLast30Days: recentMessages,
          avgDaily: Math.round(recentMessages / 30),
        },
      },
    };
  });

  // ============================================
  // PATCH /whatsapp/phone-numbers/:id — Update phone with full settings
  // ============================================
  app.patch('/whatsapp/phone-numbers/:id', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      displayName: z.string().min(1).max(30).optional(),
      metaPhoneId: z.string().optional(),
      phoneNumberId: z.string().optional(),
      accessToken: z.string().optional(),
      status: z.enum(['pending_verification', 'verified', 'suspended', 'limited']).optional(),
      timezone: z.string().optional(),
      dailySentLimit: z.number().min(100).max(10000).optional(),
      businessHours: z.object({
        enabled: z.boolean().optional(),
        monday: z.object({ start: z.string(), end: z.string() }).optional(),
        tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
        wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
        thursday: z.object({ start: z.string(), end: z.string() }).optional(),
        friday: z.object({ start: z.string(), end: z.string() }).optional(),
        saturday: z.object({ start: z.string(), end: z.string() }).optional(),
        sunday: z.object({ start: z.string(), end: z.string() }).optional(),
      }).optional(),
      awayMessage: z.string().max(500).optional(),
      greetingMessage: z.string().max(160).optional(),
      canSendMarketing: z.boolean().optional(),
      canSendUtility: z.boolean().optional(),
      canSendAuth: z.boolean().optional(),
    }).parse(request.body);

    // accessToken is encrypted at rest, so it can't ride along in the spread —
    // writing `body` wholesale is what previously stored these in plaintext.
    const { accessToken, ...rest } = body;
    const data: Prisma.PhoneNumberUpdateManyMutationInput = {
      ...rest,
      ...(accessToken !== undefined && { accessToken: encryptSecret(accessToken) }),
    };

    const phone = await app.prisma.phoneNumber.updateMany({
      where: { id, tenantId: request.authUser.tenantId },
      data,
    });

    if (phone.count === 0) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    return { success: true, data: { message: 'Phone number updated' } };
  });

  // ============================================
  // DELETE /whatsapp/phone-numbers/:id — Remove phone number
  // ============================================
  app.delete('/whatsapp/phone-numbers/:id', { preHandler: [app.requirePermission('phone_numbers', 'delete')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    try {
      await app.prisma.phoneNumber.deleteMany({
        where: { id, tenantId: request.authUser.tenantId },
      });
    } catch (err) {
      const isFkViolation =
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') ||
        (err instanceof Error && err.message.includes('foreign key constraint'));

      if (isFkViolation) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PHONE_HAS_CONVERSATIONS',
            message: 'This phone number has existing conversations and cannot be deleted. Delete or reassign those conversations first.',
          },
        });
      }
      throw err;
    }

    return { success: true, data: { message: 'Phone number removed' } };
  });

  // ============================================
  // POST /whatsapp/phone-numbers/:id/disconnect — Remove the Meta connection
  // without deleting the row or its conversation/message history. The FK on
  // Conversation.phoneNumberId deliberately blocks a hard delete once real
  // conversations exist (so removing a number can never silently wipe out
  // chat history) — this is the non-destructive alternative for that case:
  // clear the live credentials/IDs, keep everything else intact.
  // ============================================
  app.post('/whatsapp/phone-numbers/:id/disconnect', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });
    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const updated = await app.prisma.phoneNumber.update({
      where: { id },
      data: {
        status: 'disconnected',
        metaPhoneId: null,
        metaHolderId: null,
        wabaId: null,
        accessToken: null,
      },
    });

    return { success: true, data: updated };
  });

  // ============================================
  // POST /whatsapp/phone-numbers/:id/refresh-quality — Refresh quality score
  // ============================================
  app.post('/whatsapp/phone-numbers/:id/refresh-quality', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // 1. Load tenant credentials for fallback access token
    const creds = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    // Tenant-scoped credentials only - no platform-wide env fallback, so an
    // unconfigured tenant can't piggyback on the platform's own Meta identity.
    const token = resolveAccessToken(phone.accessToken, creds?.accessToken);
    const metaPhoneId = phone.metaPhoneId || null;

    // Starts as UNKNOWN rather than GREEN: a number we have never successfully
    // read a rating for has unknown quality, and reporting that as the best
    // possible score overstated every new number's standing.
    let realQualityScore = phone.qualityScore || 'UNKNOWN';
    let metaStatus = phone.status;
    let nameStatus: string | null = phone.nameStatus;
    let messagingLimitTier: string | null = phone.messagingLimitTier;

    // 2. Try fetching real Meta Graph API quality rating & line status
    if (token && metaPhoneId) {
      try {
        const metaRes = await fetch(
          `https://graph.facebook.com/v19.0/${metaPhoneId}?fields=display_phone_number,quality_rating,name_status,status,messaging_limit_tier&access_token=${token}`
        );
        if (metaRes.ok) {
          const metaData: any = await metaRes.json();
          const rating = metaData.quality_rating?.toUpperCase();
          if (rating) {
            // Meta's own UNKNOWN is carried through as UNKNOWN. It previously
            // mapped to GREEN, which is what a brand new number reports.
            realQualityScore = ['GREEN', 'YELLOW', 'RED'].includes(rating) ? rating : 'UNKNOWN';
          }
          if (metaData.status) {
            metaStatus = metaData.status.toLowerCase() === 'connected' || metaData.status.toLowerCase() === 'approved' ? 'verified' : phone.status;
          }
          if (metaData.name_status) nameStatus = String(metaData.name_status).toUpperCase();
          if (metaData.messaging_limit_tier) messagingLimitTier = String(metaData.messaging_limit_tier).toUpperCase();
        }
      } catch (e) {
        // Fall back to database calculation below
      }
    }

    // 3. Fallback: Calculate real quality score from actual database message history
    if (!token || !metaPhoneId) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [totalCount, failedCount] = await Promise.all([
        app.prisma.message.count({ where: { phoneNumberId: id, createdAt: { gte: thirtyDaysAgo } } }),
        app.prisma.message.count({ where: { phoneNumberId: id, status: 'FAILED', createdAt: { gte: thirtyDaysAgo } } }),
      ]);

      if (totalCount > 0) {
        const failRate = failedCount / totalCount;
        realQualityScore = failRate > 0.15 ? 'RED' : failRate > 0.05 ? 'YELLOW' : 'GREEN';
      }
    }

    await app.prisma.phoneNumber.update({
      where: { id },
      data: {
        qualityScore: realQualityScore,
        status: metaStatus,
        nameStatus,
        messagingLimitTier,
        ...(messagingLimitTier ? { messagingTierFetchedAt: new Date() } : {}),
      },
    });

    // Record this reading so the trend is built from real observations.
    // PhoneNumberQualityLog existed with exactly these columns but was never
    // written to, which left /whatsapp/quality/history with nothing to serve.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recent = await app.prisma.message.findMany({
      where: { phoneNumberId: id, createdAt: { gte: sevenDaysAgo } },
      select: { status: true, direction: true, conversationId: true, createdAt: true },
    });

    const outgoing = recent.filter(m => m.direction === 'OUTGOING');
    const accepted = outgoing.filter(m => m.status === 'SENT' || m.status === 'DELIVERED' || m.status === 'READ');

    // A response is an inbound message arriving in the same conversation within
    // 24h of one of ours — the same definition the quality report uses.
    const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const inboundByConversation = new Map<string, Date[]>();
    for (const m of recent) {
      if (m.direction !== 'INCOMING') continue;
      const arr = inboundByConversation.get(m.conversationId) || [];
      arr.push(m.createdAt);
      inboundByConversation.set(m.conversationId, arr);
    }
    const responded = outgoing.filter(m => {
      const replies = inboundByConversation.get(m.conversationId) || [];
      return replies.some(t => t > m.createdAt && t.getTime() - m.createdAt.getTime() <= RESPONSE_WINDOW_MS);
    }).length;

    await app.prisma.phoneNumberQualityLog.create({
      data: {
        phoneNumberId: id,
        qualityScore: realQualityScore,
        messagesLast7Days: outgoing.length,
        deliveryRate: outgoing.length > 0 ? Math.round((accepted.length / outgoing.length) * 1000) / 10 : 0,
        responseRate: outgoing.length > 0 ? Math.round((responded / outgoing.length) * 1000) / 10 : 0,
      },
    }).catch((err: any) => {
      // Logging the reading must never fail the refresh itself.
      console.error(`[quality] could not log reading for phone ${id}:`, err?.message);
    });

    return {
      success: true,
      data: {
        qualityScore: realQualityScore,
        status: metaStatus,
        updated: new Date().toISOString(),
      },
    };
  });

  // ============================================
  // GET /whatsapp/business-verification — Get business verification status
  // ============================================
  app.get('/whatsapp/business-verification', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const [tenant, creds, phoneCount, approvedTemplateCount] = await Promise.all([
      app.prisma.tenant.findUnique({
        where: { id: request.authUser.tenantId },
        select: { metaBusinessId: true, name: true },
      }),
      app.prisma.whatsAppCredentials.findUnique({ where: { tenantId: request.authUser.tenantId } }),
      app.prisma.phoneNumber.count({ where: { tenantId: request.authUser.tenantId } }),
      app.prisma.template.count({ where: { tenantId: request.authUser.tenantId, status: 'APPROVED' } }),
    ]);

    // Business verification, the green tick, and display-name approval are three
    // separate things in Meta — a business can be verified without a tick, and
    // display names are approved per phone number, not per business. All three
    // used to be the same boolean wearing different names.
    let businessVerifiedFromMeta: boolean | null = null;
    let officialBusinessAccount: boolean | null = null;

    if (creds?.accessToken) {
      const wabaId = await resolveEffectiveWabaId(app.prisma, request.authUser.tenantId, creds.wabaId);
      if (wabaId) {
        try {
          const res = await axios.get(`https://graph.facebook.com/v18.0/${wabaId}`, {
            params: {
              access_token: decryptSecret(creds.accessToken),
              fields: 'business_verification_status,is_official_business_account',
            },
          });
          businessVerifiedFromMeta = res.data?.business_verification_status === 'verified';
          if (typeof res.data?.is_official_business_account === 'boolean') {
            officialBusinessAccount = res.data.is_official_business_account;
          }
        } catch {
          // Leave as null — reported as "unknown" rather than assumed either way.
        }
      }
    }

    // Display-name approval lives on each phone number. Report the weakest state
    // across connected numbers, since one declined name is what the tenant needs
    // to act on.
    const phones = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
      select: { id: true, phoneNumber: true, displayName: true, nameStatus: true },
    });
    // Meta reports a usable display name as either APPROVED or
    // AVAILABLE_WITHOUT_REVIEW (a name that needs no review at all). Treating
    // only APPROVED as good marked perfectly valid numbers as unapproved.
    const NAME_OK = new Set(['APPROVED', 'AVAILABLE_WITHOUT_REVIEW']);
    const namesKnown = phones.filter(p => p.nameStatus && p.nameStatus !== 'UNKNOWN');
    const anyNameDeclined = namesKnown.some(p => p.nameStatus === 'DECLINED' || p.nameStatus === 'EXPIRED');
    const anyNamePending = namesKnown.some(p => p.nameStatus === 'PENDING_REVIEW');
    const allNamesApproved = namesKnown.length > 0 && namesKnown.every(p => NAME_OK.has(p.nameStatus!));

    const businessVerified = businessVerifiedFromMeta ?? !!tenant?.metaBusinessId;
    const hasPhone = phoneCount > 0;

    const displayNameStatus = anyNameDeclined
      ? 'declined'
      : anyNamePending
        ? 'pending'
        : allNamesApproved
          ? 'completed'
          : hasPhone
            ? 'unknown'
            : 'pending';

    return {
      success: true,
      data: {
        businessVerified,
        // null means "we couldn't read it from Meta", which is different from
        // false and should be shown as such rather than as a failed check.
        greenTickEnabled: officialBusinessAccount,
        displayNameApproved: allNamesApproved,
        // Domain verification isn't exposed on this API surface; claiming a
        // value for it was pure invention.
        domainVerified: null,
        businessName: tenant?.name || 'Your Business',
        phoneNameStatuses: phones.map(p => ({
          phoneNumber: p.phoneNumber,
          displayName: p.displayName,
          nameStatus: p.nameStatus ?? 'UNKNOWN',
        })),
        steps: [
          {
            id: 'business',
            name: 'Business Verification',
            status: businessVerified ? 'completed' : 'pending',
            description: businessVerified ? 'Your business is verified with Meta' : 'Verify your business with Meta',
          },
          {
            id: 'phone',
            name: 'Phone Numbers',
            status: hasPhone ? 'completed' : 'pending',
            description: hasPhone ? `${phoneCount} number${phoneCount === 1 ? '' : 's'} connected` : 'Connect at least one phone number',
          },
          {
            id: 'display_name',
            name: 'Display Name',
            status: displayNameStatus,
            description: anyNameDeclined
              ? 'Meta declined a display name — open the number to submit a new one'
              : anyNamePending
                ? 'Meta is reviewing a display name'
                : allNamesApproved
                  ? 'Display names approved by Meta'
                  : hasPhone
                    ? 'Not read from Meta yet — refresh a number to check'
                    : 'Connect a phone number to set a display name',
          },
          {
            id: 'template',
            name: 'Message Templates',
            status: approvedTemplateCount > 0 ? 'completed' : 'pending',
            description: approvedTemplateCount > 0
              ? `${approvedTemplateCount} approved template${approvedTemplateCount === 1 ? '' : 's'}`
              : 'Submit templates for approval',
          },
        ],
      },
    };
  });

  // ============================================
  // PATCH /whatsapp/business-verification — Update verification info
  // ============================================
  app.patch('/whatsapp/business-verification', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const body = z.object({
      industry: z.string().optional(),
      useCase: z.string().optional(),
    }).parse(request.body);

    await app.prisma.tenant.update({
      where: { id: request.authUser.tenantId },
      data: {
        industry: body.industry,
        useCase: body.useCase,
      },
    });

    return { success: true, data: { message: 'Verification info updated' } };
  });

  // ============================================
  // GET /whatsapp/quality-report/:phoneId — Get detailed quality report
  // ============================================
  app.get('/whatsapp/quality-report/:phoneId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneId } = z.object({ phoneId: z.string() }).parse(request.params);
    const { period } = request.query as { period?: string };

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneId, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Calculate metrics based on period
    const days = period === '90' ? 90 : period === '30' ? 30 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get message stats — includes direction/conversationId now so a real
    // response rate can be computed (was hardcoded to 0 everywhere before,
    // both in the headline metric and every daily-trend point).
    const messages = await app.prisma.message.findMany({
      where: {
        phoneNumberId: phoneId,
        createdAt: { gte: startDate },
      },
      select: {
        status: true,
        readAt: true,
        createdAt: true,
        direction: true,
        conversationId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalMessages = messages.length;
    // READ is a terminal state past DELIVERED, so excluding it undercounted
    // delivery — a message the recipient actually opened was scored as not
    // delivered.
    const DELIVERED_STATES = new Set(['SENT', 'DELIVERED', 'READ']);
    const delivered = messages.filter(m => DELIVERED_STATES.has(m.status)).length;
    const read = messages.filter(m => m.readAt).length;

    // A "response" is a real inbound message in the same conversation
    // within 24h of an outbound one — computed from our own message log,
    // since Meta doesn't expose this as a queryable metric directly.
    const RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const incomingByConversation = new Map<string, Date[]>();
    for (const m of messages) {
      if (m.direction !== 'INCOMING') continue;
      const arr = incomingByConversation.get(m.conversationId) || [];
      arr.push(m.createdAt);
      incomingByConversation.set(m.conversationId, arr);
    }
    const gotResponse = (m: (typeof messages)[number]) => {
      const replies = incomingByConversation.get(m.conversationId) || [];
      return replies.some(t => t.getTime() > m.createdAt.getTime() && t.getTime() - m.createdAt.getTime() <= RESPONSE_WINDOW_MS);
    };

    const outgoing = messages.filter(m => m.direction === 'OUTGOING');
    const responded = outgoing.filter(gotResponse).length;
    const responseRate = outgoing.length > 0 ? Math.round((responded / outgoing.length) * 100 * 10) / 10 : 0;

    // Calculate real historical daily trends from database records
    const dailyTrend = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateStr = date.toISOString().split('T')[0];

      const dayMsgs = messages.filter(m => m.createdAt.toISOString().split('T')[0] === dateStr);
      const dayTotal = dayMsgs.length;
      const dayDelivered = dayMsgs.filter(m => DELIVERED_STATES.has(m.status)).length;
      const dayRead = dayMsgs.filter(m => m.readAt).length;
      const dayOutgoing = dayMsgs.filter(m => m.direction === 'OUTGOING');
      const dayResponded = dayOutgoing.filter(gotResponse).length;

      return {
        date: dateStr,
        deliveryRate: dayTotal > 0 ? Math.round((dayDelivered / dayTotal) * 100) : 100,
        openRate: dayTotal > 0 ? Math.round((dayRead / dayTotal) * 100) : 0,
        responseRate: dayOutgoing.length > 0 ? Math.round((dayResponded / dayOutgoing.length) * 100) : 0,
      };
    });

    const failed = messages.filter(m => m.status === 'FAILED').length;

    return {
      success: true,
      data: {
        phoneNumber: phone.phoneNumber,
        // Was defaulting to 'GREEN' (the best possible score) whenever we
        // simply hadn't fetched a real one yet — silently overstated quality
        // instead of admitting it's unknown.
        qualityScore: phone.qualityScore || 'UNKNOWN',
        period: `${days} days`,
        metrics: {
          totalMessages,
          deliveryRate: totalMessages > 0 ? Math.round((delivered / totalMessages) * 100 * 10) / 10 : 100,
          openRate: totalMessages > 0 ? Math.round((read / totalMessages) * 100 * 10) / 10 : 0,
          responseRate,
          // This is the share of our sends that failed. It was labelled
          // "blockRate", which it never measured — Meta does not expose how many
          // recipients blocked a number, and the UI told people to keep the
          // number under 1% as though it did.
          failureRate: totalMessages > 0 ? Math.round((failed / totalMessages) * 100 * 10) / 10 : 0,
          failedCount: failed,
        },
        dailyTrend,
        // Meta publishes no per-metric benchmarks, so the 95/75/45 figures shown
        // here previously were invented. Issues and recommendations were canned
        // strings keyed off the quality colour — identical for every tenant, in
        // every state — and are gone for the same reason. The one real signal is
        // Meta's own quality rating, already reported above.
        issues: phone.qualityScore === 'RED'
          ? ['Meta has rated this number RED. Review recent message content and confirm recipients opted in.']
          : phone.qualityScore === 'YELLOW'
            ? ['Meta has rated this number YELLOW. Watch for further degradation.']
            : [],
        updatedAt: new Date().toISOString(),
      },
    };
  });

  // ============================================
  // GET /whatsapp/credentials — Get THIS TENANT's WhatsApp credentials
  // ============================================
  app.get('/whatsapp/credentials', { preHandler: [app.requirePermission('settings', 'read')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get tenant-specific credentials (per-tenant isolation)
    const creds = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    return {
      success: true,
      data: {
        appId: creds?.appId || '',
        wabaId: creds?.wabaId || '',
        businessAccountId: creds?.businessId || '',
        isConfigured: !!creds?.isConfigured,
        hasAppSecret: !!creds?.appSecret,
        hasAccessToken: !!creds?.accessToken,
        webhookUrl: creds?.webhookUrl || '',
        webhookEnabled: creds?.webhookEnabled || false,
        rateLimitDaily: creds?.rateLimitDaily || 1000,
        rateLimitHourly: creds?.rateLimitHourly || 250,
        lastTestedAt: creds?.lastTestedAt,
        lastError: creds?.lastError,
      },
    };
  });

  // ============================================
  // POST /whatsapp/credentials — Save THIS TENANT's WhatsApp credentials
  // Each tenant saves their own credentials - multi-tenant isolation
  // ============================================
  app.post('/whatsapp/credentials', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      appId: z.string().min(10, 'App ID required'),
      appSecret: z.string().optional(),
      accessToken: z.string().optional(),
      wabaId: z.string().optional(),
      businessAccountId: z.string().optional(),
    });

    const body = schema.parse(request.body);

    // Load existing credentials so we can keep secret/token if not re-entered
    const existing = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    const newSecret = body.appSecret && body.appSecret.length >= 10 ? encryptSecret(body.appSecret) : existing?.appSecret;
    const newToken = body.accessToken && body.accessToken.length >= 20 ? encryptSecret(body.accessToken) : existing?.accessToken;

    await app.prisma.whatsAppCredentials.upsert({
      where: { tenantId: request.authUser.tenantId },
      update: {
        appId: body.appId,
        appSecret: newSecret,
        accessToken: newToken,
        wabaId: body.wabaId,
        businessId: body.businessAccountId,
        isConfigured: !!(body.appId && newSecret && newToken),
        lastTestedAt: new Date(),
        lastError: null,
      },
      create: {
        tenantId: request.authUser.tenantId,
        appId: body.appId,
        appSecret: newSecret,
        accessToken: newToken,
        wabaId: body.wabaId,
        businessId: body.businessAccountId,
        isConfigured: !!(body.appId && newSecret && newToken),
        lastTestedAt: new Date(),
      },
    });

    return {
      success: true,
      data: { message: 'Credentials saved successfully' },
    };
  });

  // ============================================
  // POST /whatsapp/credentials/test — Test THIS TENANT's credentials
  // ============================================
  app.post('/whatsapp/credentials/test', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      appId: z.string().optional(),
      appSecret: z.string().optional(),
      accessToken: z.string().optional(),
    });

    const body = schema.parse(request.body || {});

    // Load tenant's credentials (per-tenant isolation)
    const creds = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
    });

    // Use provided credentials or stored ones (decrypting anything read from storage)
    const appId = body.appId || creds?.appId;
    const appSecret = body.appSecret || decryptIfPresent(creds?.appSecret);
    const accessToken = body.accessToken || decryptIfPresent(creds?.accessToken);

    const isConfigured = !!(appId && accessToken);

    // Test connection to Meta API
    let connectionValid = false;
    let apiError: string | null = null;

    if (isConfigured && accessToken && appId) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${appId}?access_token=${accessToken}`
        );
        connectionValid = response.ok;
        if (!connectionValid) {
          const error = await response.json().catch(() => ({}));
          apiError = error.error?.message || 'API returned error';
        }
      } catch (e) {
        connectionValid = false;
        apiError = 'Network error - could not connect to Meta';
      }
    }

    // Update test result in database
    await app.prisma.whatsAppCredentials.upsert({
      where: { tenantId: request.authUser.tenantId },
      create: {
        tenantId: request.authUser.tenantId,
        appId,
        accessToken: accessToken ? encryptSecret(accessToken) : undefined,
        isConfigured,
        lastTestedAt: new Date(),
        lastError: apiError,
      },
      update: {
        lastTestedAt: new Date(),
        lastError: apiError,
      },
    });

    return {
      success: true,
      data: {
        valid: connectionValid,
        configured: isConfigured,
        message: connectionValid ? 'Credentials are valid and connected!'
                   : (isConfigured ? 'Invalid credentials'
                   : 'Please add credentials first'),
        lastError: apiError,
        testedAt: new Date().toISOString(),
        apiVersion: 'v18.0',
      },
    };
  });

  // ============================================
  // POST /whatsapp/credentials/send-test — Send test message
  // ============================================
  app.post('/whatsapp/credentials/send-test', { preHandler: [app.requirePermission('messages', 'send')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      phoneNumberId: z.string(),
      testPhone: z.string().regex(/^\+?[1-9]\d{6,14}$/),
    });

    const body = schema.parse(request.body);
    const tenantId = request.authUser.tenantId;

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id: body.phoneNumberId, tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    let contact = await app.prisma.contact.findFirst({
      where: { tenantId, phone: body.testPhone },
    });
    if (!contact) {
      contact = await app.prisma.contact.create({
        data: { tenantId, name: body.testPhone, phone: body.testPhone, country: 'IN' },
      });
    }

    let conversation = await app.prisma.conversation.findUnique({
      where: {
        contactId_phoneNumberId_tenantId: {
          contactId: contact.id,
          phoneNumberId: body.phoneNumberId,
          tenantId,
        },
      },
    });
    if (!conversation) {
      conversation = await app.prisma.conversation.create({
        data: { tenantId, contactId: contact.id, phoneNumberId: body.phoneNumberId, status: 'OPEN' },
      });
    }

    const testText = 'This is a test message from Kriscel WA confirming your WhatsApp connection is working.';
    const message = await app.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        phoneNumberId: body.phoneNumberId,
        direction: 'OUTGOING',
        type: 'TEXT',
        body: testText,
        status: 'PENDING',
      },
    });

    const { dispatchOutboundMessage } = await import('../services/whatsappService.js');
    const result = await dispatchOutboundMessage({
      app,
      messageId: message.id,
      tenantId,
      contactPhone: body.testPhone,
      phoneNumberId: body.phoneNumberId,
      body: testText,
      type: 'text',
    });

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SEND_FAILED', message: result.error || 'Failed to send test message' },
      });
    }

    return {
      success: true,
      data: {
        message: 'Test message sent',
        to: body.testPhone,
        messageId: result.metaMessageId,
        sentAt: new Date().toISOString(),
      },
    };
  });

  // ============================================
  // GET /whatsapp/webhook-url — Get the webhook URL
  // ============================================
  app.get('/whatsapp/webhook-url', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const webhookUrl = process.env.PUBLIC_API_URL || process.env.API_URL
      ? `${new URL(process.env.PUBLIC_API_URL || process.env.API_URL!).origin}/webhook`
      : `http://localhost:${process.env.PORT || 3001}/webhook`;

    return { success: true, data: { webhookUrl } };
  });

  // ============================================
  // GET /whatsapp/webhook/settings — Get webhook settings
  // ============================================
  app.get('/whatsapp/webhook/settings', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get webhook logs
    const webhookLogs = await (app.prisma as any).webhookLog?.findMany?.({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }).catch(() => []) || [];

    // Query Meta directly for the app's real webhook subscription — this
    // used to hardcode every field as always-enabled, which silently lied:
    // several of these (message_deliveries, message_reads, etc.) are legacy
    // On-Premises API fields Meta rejects outright for this app's Cloud API
    // permission tier (confirmed directly against Meta's own API earlier),
    // so they were never actually subscribed no matter what this showed.
    let subscribedFields: string[] = [];
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (appId && appSecret) {
      try {
        const subRes = await axios.get(`https://graph.facebook.com/v18.0/${appId}/subscriptions`, {
          params: { access_token: `${appId}|${appSecret}` },
        });
        const sub = (subRes.data?.data || []).find((s: any) => s.object === 'whatsapp_business_account');
        subscribedFields = (sub?.fields || []).map((f: any) => f.name);
      } catch {
        // Leave subscribedFields empty — surfaced as all-false below rather
        // than falling back to a guess.
      }
    }

    const KNOWN_FIELDS = ['messages', 'message_template_status_update'];
    const fields: Record<string, boolean> = {};
    for (const f of KNOWN_FIELDS) fields[f] = subscribedFields.includes(f);

    return {
      success: true,
      data: {
        fields,
        // Cloud API subscribes the *app* to the whatsapp_business_account
        // object, so every WABA connected to this app shares one subscription.
        // A tenant cannot have its own field selection, and presenting this as a
        // per-tenant setting is what made the old editable UI misleading.
        managedAtPlatformLevel: true,
        // Meta retries failed deliveries on its own schedule and does not let
        // the receiver configure it. The retry knobs shown here previously were
        // hardcoded constants that nothing read.
        retryPolicy: 'Meta retries failed deliveries automatically; the schedule is not configurable.',
        logs: webhookLogs,
      },
    };
  });

  // ============================================
  // PATCH /whatsapp/webhook/settings — Update webhook settings
  // ============================================
  app.patch('/whatsapp/webhook/settings', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Webhook subscriptions belong to the Meta *app*, not to a tenant: one
    // subscription serves every WABA connected to it. Letting one tenant change
    // it would silently change event delivery for all of them.
    //
    // This used to accept the request, echo it back, and report success without
    // persisting anything or contacting Meta — so toggles appeared to save and
    // then reverted on reload. Refusing honestly is better than pretending.
    return reply.status(409).send({
      success: false,
      error: {
        code: 'MANAGED_AT_PLATFORM_LEVEL',
        message:
          'Webhook subscriptions are configured once for the whole platform and cannot be changed per workspace. ' +
          'Contact support if you need a different set of events.',
      },
    });
  });

  // ============================================
  // POST /whatsapp/webhook/test — Test webhook
  // ============================================
  app.post('/whatsapp/webhook/test', { preHandler: [app.requirePermission('settings', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Exercises the two things that actually break in a webhook setup: whether
    // Meta can reach the URL at all, and whether the endpoint correctly rejects
    // requests that aren't signed by Meta.
    //
    // Deliberately runs the verification handshake rather than delivering a fake
    // event — a synthetic "message" would land in the tenant's inbox as though a
    // customer had written in. This used to return success unconditionally,
    // including when the webhook was entirely broken.
    const base = process.env.PUBLIC_API_URL || process.env.API_URL;
    if (!base) {
      return reply.status(500).send({
        success: false,
        error: { code: 'NO_PUBLIC_URL', message: 'PUBLIC_API_URL is not configured, so the webhook URL cannot be determined.' },
      });
    }

    const webhookUrl = `${new URL(base).origin}/webhook`;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

    // 1. Reachability + verify token — the exact handshake Meta performs.
    if (!verifyToken) {
      checks.push({ name: 'Verification handshake', passed: false, detail: 'META_WEBHOOK_VERIFY_TOKEN is not configured.' });
    } else {
      const challenge = `test${Date.now()}`;
      try {
        const res = await fetch(
          `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        const text = (await res.text()).trim();
        checks.push({
          name: 'Verification handshake',
          passed: res.ok && text === challenge,
          detail: res.ok && text === challenge
            ? 'Meta can reach the URL and the verify token matches.'
            : `Expected the challenge echoed back, got HTTP ${res.status} "${text.slice(0, 60)}".`,
        });
      } catch (err: any) {
        checks.push({ name: 'Verification handshake', passed: false, detail: `Could not reach the webhook URL: ${err?.message}` });
      }
    }

    // 2. Signature enforcement — an unsigned POST must be refused.
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
        signal: AbortSignal.timeout(10_000),
      });
      checks.push({
        name: 'Signature enforcement',
        passed: res.status === 403,
        detail: res.status === 403
          ? 'Unsigned requests are rejected, as they should be.'
          : `An unsigned request returned HTTP ${res.status} instead of 403 — the endpoint may be accepting forged events.`,
      });
    } catch (err: any) {
      checks.push({ name: 'Signature enforcement', passed: false, detail: `Could not complete the check: ${err?.message}` });
    }

    // 3. Whether Meta has actually been delivering events here.
    const lastEvent = await app.prisma.webhookLog.findFirst({
      where: { tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, event: true },
    });
    checks.push({
      name: 'Recent deliveries',
      passed: !!lastEvent,
      detail: lastEvent
        ? `Last event received ${lastEvent.createdAt.toISOString()} (${lastEvent.event}).`
        : 'No webhook events have been received for this workspace yet.',
    });

    return {
      success: true,
      data: {
        webhookUrl,
        healthy: checks.every(c => c.passed),
        checks,
        testedAt: new Date().toISOString(),
      },
    };
  });

  // ============================================
  // POST /whatsapp/phone-numbers/bulk-import — Bulk import phone numbers
  // ============================================
  app.post('/whatsapp/phone-numbers/bulk-import', { preHandler: [app.requirePermission('phone_numbers', 'create')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const schema = z.object({
      phoneNumbers: z.array(z.object({
        phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/),
        displayName: z.string().max(30).optional(),
        metaPhoneId: z.string().optional(),
      })).min(1).max(100),
    });

    const body = schema.parse(request.body);

    // Check current count
    const currentCount = await app.prisma.phoneNumber.count({
      where: { tenantId: request.authUser.tenantId },
    });

    const maxPhones = 10; // Can be increased based on plan

    if (currentCount + body.phoneNumbers.length > maxPhones) {
      return reply.status(403).send({
        success: false,
        error: { code: 'LIMIT_EXCEEDED', message: `Import would exceed ${maxPhones} phone limit` },
      });
    }

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const phone of body.phoneNumbers) {
      try {
        const existing = await app.prisma.phoneNumber.findFirst({
          where: { tenantId: request.authUser.tenantId, phoneNumber: phone.phoneNumber },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        await app.prisma.phoneNumber.create({
          data: {
            tenantId: request.authUser.tenantId,
            phoneNumber: phone.phoneNumber,
            displayName: phone.displayName || null,
            metaPhoneId: phone.metaPhoneId || null,
            status: phone.metaPhoneId ? 'verified' : 'pending_verification',
          },
        });
        results.created++;
      } catch (err) {
        results.errors.push(`${phone.phoneNumber}: Import failed`);
      }
    }

    return {
      success: true,
      data: {
        message: `Import complete: ${results.created} created, ${results.skipped} skipped`,
        ...results,
      },
    };
  });

  // ============================================
  // GET /whatsapp/rate-limits — Get rate limit status
  // ============================================
  app.get('/whatsapp/rate-limits', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const phoneNumbers = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
      select: {
        id: true,
        phoneNumber: true,
        metaPhoneId: true,
        accessToken: true,
        dailySentLimit: true,
        todaySentCount: true,
        lastResetAt: true,
      },
    });

    const creds = await app.prisma.whatsAppCredentials.findUnique({ where: { tenantId: request.authUser.tenantId } });

    // Meta doesn't publish a "messages per minute/hour/day" figure at all —
    // that was a fabricated shape. What Meta actually enforces is a
    // messaging_limit_tier per phone number (a cap on unique customers
    // messaged per rolling 24h). Fetch the real tier live instead of
    // showing the same fictional numbers for every tenant.
    const TIER_LIMITS: Record<string, number | null> = {
      TIER_50: 50,
      TIER_250: 250,
      TIER_1K: 1000,
      TIER_10K: 10000,
      TIER_100K: 100000,
      TIER_UNLIMITED: null, // null = no cap
      NOT_ELIGIBLE: 0,
    };

    const phonesWithTier = await Promise.all(phoneNumbers.map(async (p) => {
      const resetAt = p.lastResetAt ? new Date(new Date(p.lastResetAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
      let messagingLimitTier: string | null = null;
      let messagingLimit: number | null = null;

      const token = resolveAccessToken(p.accessToken, creds?.accessToken);
      if (token && p.metaPhoneId) {
        try {
          const res = await axios.get(`https://graph.facebook.com/v18.0/${p.metaPhoneId}`, {
            params: { access_token: token, fields: 'messaging_limit_tier' },
          });
          messagingLimitTier = res.data?.messaging_limit_tier || null;
          messagingLimit = messagingLimitTier ? TIER_LIMITS[messagingLimitTier] ?? null : null;
        } catch {
          // Leave null — surfaced as "not available" rather than a guess.
        }
      }

      return {
        id: p.id,
        phoneNumber: p.phoneNumber,
        dailySentLimit: p.dailySentLimit,
        todaySentCount: p.todaySentCount,
        resetAt,
        messagingLimitTier,
        messagingLimit,
      };
    }));

    return {
      success: true,
      data: { phones: phonesWithTier },
    };
  });

  // ============================================
  // GET /whatsapp/template-usage/:phoneId — Get template usage stats
  // ============================================
  app.get('/whatsapp/template-usage/:phoneId', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { phoneId } = z.object({ phoneId: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id: phoneId, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
    }

    // Get template usage from messages
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const messages = await app.prisma.message.groupBy({
      by: ['templateId'],
      where: {
        phoneNumberId: phoneId,
        templateId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    return {
      success: true,
      data: {
        phoneNumber: phone.phoneNumber,
        totalTemplatesUsed: messages.length,
        topTemplates: messages.slice(0, 10).map(m => ({
          templateId: m.templateId,
          usageCount: m._count,
        })),
        period: '30 days',
      },
    };
  });

  // ============================================
  // GET /whatsapp/phone-numbers/:id/details — Get phone number details
  // ============================================
  app.get('/whatsapp/phone-numbers/:id/details', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
      include: {
        _count: { select: { messages: true, conversations: true } },
      },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
    }

    return {
      success: true,
      data: {
        ...phone,
        totalMessages: phone._count.messages,
        totalConversations: phone._count.conversations,
      },
    };
  });

  // ============================================
  // PATCH /whatsapp/phone-numbers/:id/settings — Update phone settings
  // ============================================
  app.patch('/whatsapp/phone-numbers/:id/settings', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      timezone: z.string().optional(),
      dailySentLimit: z.number().optional(),
      autoReplyEnabled: z.boolean().optional(),
      autoReplyMessage: z.string().optional(),
      businessHoursEnabled: z.boolean().optional(),
      businessHours: z.object({
        monday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        tuesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        wednesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        thursday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        friday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        saturday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
        sunday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
      }).optional(),
    }).parse(request.body);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
    }

    const updateData: any = {};
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.dailySentLimit !== undefined) updateData.dailySentLimit = body.dailySentLimit;
    if (body.businessHours !== undefined) updateData.businessHours = body.businessHours;

    const updated = await app.prisma.phoneNumber.update({
      where: { id },
      data: updateData,
    });

    return { success: true, data: updated };
  });

  // ============================================
  // POST /whatsapp/phone-numbers/:id/quick-replies — Create quick reply
  // ============================================
  app.post('/whatsapp/phone-numbers/:id/quick-replies', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      keyword: z.string().min(1).max(50),
      message: z.string().min(1).max(500),
    }).parse(request.body);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });

    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
    }

    const quickReply = await app.prisma.quickReply.create({
      data: {
        tenantId: request.authUser.tenantId,
        phoneNumberId: id,
        keyword: body.keyword,
        message: body.message,
        isActive: true,
      },
    });

    return { success: true, data: quickReply };
  });

  // ============================================
  // GET /whatsapp/phone-numbers/:id/quick-replies — List quick replies
  // ============================================
  app.get('/whatsapp/phone-numbers/:id/quick-replies', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const quickReplies = await app.prisma.quickReply.findMany({
      where: { phoneNumberId: id, tenantId: request.authUser.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: quickReplies };
  });

  // ============================================
  // DELETE /whatsapp/phone-numbers/:id/quick-replies/:qrId — Delete quick reply
  // ============================================
  app.delete('/whatsapp/phone-numbers/:id/quick-replies/:qrId', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id, qrId } = z.object({ id: z.string(), qrId: z.string() }).parse(request.params);

    await app.prisma.quickReply.deleteMany({
      where: { id: qrId, phoneNumberId: id, tenantId: request.authUser.tenantId },
    });

    return { success: true, data: { deleted: true } };
  });

  // ============================================
  // GET /whatsapp/quality/history — Get quality history
  // ============================================
  app.get('/whatsapp/quality/history', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { days, phoneId } = z.object({
      days: z.string().optional().transform(v => parseInt(v || '30')),
      phoneId: z.string().optional(),
    }).parse(request.query);

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Scope to this tenant's own phones — the log table is keyed by phone, so
    // the tenant filter has to come from the phone side.
    const phones = await app.prisma.phoneNumber.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        ...(phoneId ? { id: phoneId } : {}),
      },
      select: { id: true },
    });

    if (phones.length === 0) {
      return { success: true, data: { history: [], readings: 0 } };
    }

    const logs = await app.prisma.phoneNumberQualityLog.findMany({
      where: {
        phoneNumberId: { in: phones.map(p => p.id) },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        phoneNumberId: true,
        qualityScore: true,
        messagesLast7Days: true,
        deliveryRate: true,
        responseRate: true,
        createdAt: true,
      },
    });

    // Quality is refreshed on demand, so a day can hold several readings or
    // none. Collapse to one point per day (the last reading of that day) and
    // report only days actually observed rather than padding the gaps — an
    // invented point is what made the previous version of this endpoint
    // untrustworthy.
    const byDay = new Map<string, typeof logs[number]>();
    for (const log of logs) {
      byDay.set(log.createdAt.toISOString().split('T')[0], log);
    }

    const history = [...byDay.entries()].map(([date, log]) => ({
      date,
      score: log.qualityScore,
      messagesSent: log.messagesLast7Days,
      deliveryRate: log.deliveryRate,
      responseRate: log.responseRate,
    }));

    return {
      success: true,
      data: {
        history,
        readings: logs.length,
        // Lets the UI say "no data yet, refresh quality to start the trend"
        // instead of rendering an empty chart as though quality were zero.
        note: history.length === 0
          ? 'No quality readings recorded yet for this period.'
          : undefined,
      },
    };
  });

  // ============================================
  // GET /whatsapp/quality-report — Get overall quality report (all phones)
  // ============================================
  app.get('/whatsapp/quality-report', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    // Get phone numbers
    const phones = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
    });

    // Calculate quality stats
    const greenPhones = phones.filter(p => p.qualityScore === 'GREEN').length;
    const yellowPhones = phones.filter(p => p.qualityScore === 'YELLOW').length;
    const redPhones = phones.filter(p => p.qualityScore === 'RED').length;

    const overall = {
      totalPhones: phones.length,
      greenPhones,
      yellowPhones,
      redPhones,
      averageQuality: phones.length > 0
        ? ((greenPhones / phones.length) * 100).toFixed(1)
        : '100',
      lastUpdated: new Date().toISOString(),
    };

    // Return phones without complex selects
    const phoneData = phones.map(p => ({
      id: p.id,
      phoneNumber: p.phoneNumber,
      displayName: p.displayName,
      qualityScore: p.qualityScore,
      status: p.status,
    }));

    return { success: true, data: { overall, phones: phoneData } };
  });

  // ============================================
  // GET /whatsapp/phone-numbers/search — Search phone numbers
  // ============================================
  app.get('/whatsapp/phone-numbers/search', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { query } = z.object({
      query: z.string().optional(),
    }).parse(request.query);

    const phones = await app.prisma.phoneNumber.findMany({
      where: {
        tenantId: request.authUser.tenantId,
        OR: query ? [
          { phoneNumber: { contains: query } },
          { displayName: { contains: query } },
        ] : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { success: true, data: phones };
  });

  // ============================================
  // POST /whatsapp/phone-numbers/:id/register — Register phone with Meta Cloud API
  // ============================================
  app.post('/whatsapp/phone-numbers/:id/register', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { pin } = z.object({ pin: z.string().min(6).max(6) }).parse(request.body);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });
    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
    }
    if (!phone.metaPhoneId) {
      return reply.status(400).send({ success: false, error: { code: 'NO_META_PHONE_ID', message: 'Phone number is not linked to a Meta Phone Number ID' } });
    }

    const creds = await app.prisma.whatsAppCredentials.findUnique({ where: { tenantId: request.authUser.tenantId } });
    const token = resolveAccessToken(phone.accessToken, creds?.accessToken);
    if (!token) {
      return reply.status(400).send({ success: false, error: { code: 'NO_TOKEN', message: 'No access token configured for this account' } });
    }

    try {
      // The token was resolved above but never sent — Meta rejected every
      // registration attempt as unauthenticated. /deregister below always had it.
      const res = await fetch(`https://graph.facebook.com/v19.0/${phone.metaPhoneId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
      });
      const data: any = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message || 'Meta registration failed';
        const errCode = data?.error?.code;
        if (errCode === 190) return reply.status(401).send({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Access token expired. Please reconnect.' } });
        return reply.status(400).send({ success: false, error: { code: 'META_ERROR', message: errMsg } });
      }

      await app.prisma.phoneNumber.update({ where: { id }, data: { status: 'verified' } });
      return { success: true, data: { message: 'Phone number registered successfully with Meta Cloud API' } };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // ============================================
  // POST /whatsapp/phone-numbers/:id/deregister — Deregister phone from Meta Cloud API
  // ============================================
  app.post('/whatsapp/phone-numbers/:id/deregister', { preHandler: [app.requirePermission('phone_numbers', 'update')] }, async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);

    const phone = await app.prisma.phoneNumber.findFirst({
      where: { id, tenantId: request.authUser.tenantId },
    });
    if (!phone) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
    }
    if (!phone.metaPhoneId) {
      return reply.status(400).send({ success: false, error: { code: 'NO_META_PHONE_ID', message: 'Phone number is not linked to a Meta Phone Number ID' } });
    }

    const creds = await app.prisma.whatsAppCredentials.findUnique({ where: { tenantId: request.authUser.tenantId } });
    const token = resolveAccessToken(phone.accessToken, creds?.accessToken);
    if (!token) {
      return reply.status(400).send({ success: false, error: { code: 'NO_TOKEN', message: 'No access token configured for this account' } });
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${phone.metaPhoneId}/deregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp' }),
      });
      const data: any = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message || 'Meta deregistration failed';
        return reply.status(400).send({ success: false, error: { code: 'META_ERROR', message: errMsg } });
      }

      await app.prisma.phoneNumber.update({ where: { id }, data: { status: 'disconnected' } });
      return { success: true, data: { message: 'Phone number deregistered from Meta Cloud API' } };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // ============================================
  // GET /whatsapp/waba/billing-status — Check Meta Line of Credit / payment setup
  // ============================================
  app.get('/whatsapp/waba/billing-status', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const creds = await app.prisma.whatsAppCredentials.findUnique({ where: { tenantId: request.authUser.tenantId } });
    const wabaId = creds?.wabaId;
    const token = creds?.accessToken ? decryptSecret(creds.accessToken) : null;

    if (!wabaId || !token) {
      return { success: true, data: { configured: false, hasLineOfCredit: false, primaryFundingId: null, wabaId: null } };
    }

    try {
      // Phase 1: fetch basic WABA info (always accessible with any valid token)
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${wabaId}?fields=id,name,currency&access_token=${token}`
      );
      const data: any = await res.json();

      if (!res.ok) {
        return { success: true, data: { configured: true, hasLineOfCredit: false, primaryFundingId: null, wabaId, error: data?.error?.message } };
      }

      // Phase 2: try to read billing fields (requires BSP access — may fail for non-BSPs)
      let primaryFundingId: string | null = null;
      let paymentConfigId: string | null = null;
      let billingError: string | null = null;
      try {
        const billingRes = await fetch(
          `https://graph.facebook.com/v19.0/${wabaId}?fields=primary_funding_id,payment_configuration_id&access_token=${token}`
        );
        const billingData: any = await billingRes.json();
        if (billingRes.ok) {
          primaryFundingId = billingData.primary_funding_id || null;
          paymentConfigId = billingData.payment_configuration_id || null;
        } else {
          billingError = billingData?.error?.message || 'Failed to read billing info';
        }
      } catch {
        billingError = 'Could not reach Meta billing API';
      }

      return {
        success: true,
        data: {
          configured: true,
          hasLineOfCredit: !!primaryFundingId,
          primaryFundingId,
          paymentConfigId,
          currency: data.currency || null,
          wabaId,
          wabaName: data.name || null,
          billingError,
        },
      };
    } catch (err: any) {
      return { success: true, data: { configured: true, hasLineOfCredit: false, primaryFundingId: null, wabaId, billingError: err.message } };
    }
  });

  // ============================================
  // GET /whatsapp/accounts — List owned + client WABAs via system user token
  // ============================================
  app.get('/whatsapp/accounts', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const fields = 'id,name,currency,owner_business_info,on_behalf_of_business_info';

    // Deliberately tenant-scoped, always. This route is reachable by any signed-in
    // tenant user, so it must never answer with the platform's system user token:
    // that returns every WABA the platform owns plus every one a customer has
    // shared, which would show each customer the others' accounts. The
    // cross-customer view lives on the superadmin route instead.
    const creds = await app.prisma.whatsAppCredentials.findUnique({
      where: { tenantId: request.authUser.tenantId },
      select: { accessToken: true, wabaId: true },
    });
    const phone = await app.prisma.phoneNumber.findFirst({
      where: { tenantId: request.authUser.tenantId, wabaId: { not: null } },
      select: { accessToken: true, wabaId: true },
    });

    const token = resolveAccessToken(phone?.accessToken, creds?.accessToken);
    const wabaId = creds?.wabaId || phone?.wabaId || null;

    if (!token || !wabaId) {
      return {
        success: true,
        data: {
          scope: 'tenant',
          owned: [],
          client: [],
          note: 'No WhatsApp Business Account is connected for this workspace yet.',
        },
      };
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${wabaId}?fields=${fields}&access_token=${token}`);
      const data: any = await res.json();
      if (!res.ok) {
        return {
          success: true,
          data: { scope: 'tenant', owned: [], client: [], note: data?.error?.message || 'Could not read this account from Meta.' },
        };
      }
      return {
        success: true,
        data: {
          scope: 'tenant',
          owned: [data],
          client: [],
          note: 'Showing this workspace only.',
        },
      };
    } catch (err: any) {
      return reply.status(502).send({
        success: false,
        error: { code: 'META_UNREACHABLE', message: `Could not reach Meta: ${err.message}` },
      });
    }
  });

  // ============================================
  // GET /whatsapp/phone-numbers/export — Export phone numbers
  // ============================================
  app.get('/whatsapp/phone-numbers/export', async (request, reply) => {
    if (!request.authUser.tenantId) {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const phones = await app.prisma.phoneNumber.findMany({
      where: { tenantId: request.authUser.tenantId },
      select: {
        phoneNumber: true,
        displayName: true,
        status: true,
        qualityScore: true,
        createdAt: true,
      },
    });

    // Generate CSV
    const csv = [
      'Phone Number,Display Name,Status,Quality Score,Created At',
      ...phones.map(p => `${p.phoneNumber},${p.displayName || ''},${p.status},${p.qualityScore || 'N/A'},${p.createdAt.toISOString()}`),
    ].join('\n');

    return {
      success: true,
      data: {
        csv,
        count: phones.length,
      },
    };
  });
}

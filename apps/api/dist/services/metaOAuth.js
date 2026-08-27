/**
 * Meta OAuth & Embedded Signup Service
 * Handles WhatsApp Business API onboarding via Meta's official OAuth flow
 */
import axios from 'axios';
/**
 * Get Meta OAuth URL for user authorization
 */
export function getMetaAuthUrl(config, state) {
    const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUri,
        state: state, // For CSRF protection and tenant identification
        scope: [
            'whatsapp_business_management',
            'whatsapp_business_messaging',
            'business_management',
        ].join(','),
        response_type: 'code',
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}
/**
 * Exchange authorization code for user access token
 */
export async function exchangeCodeForToken(config, code) {
    const response = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', null, {
        params: {
            client_id: config.appId,
            client_secret: config.appSecret,
            redirect_uri: config.redirectUri,
            code,
            grant_type: 'authorization_code',
        },
    });
    return response.data;
}
/**
 * Exchange the authorization code returned by the Embedded Signup JS SDK
 * (FB.login with config_id) for an access token. Unlike the classic OAuth
 * redirect flow, this code is not tied to a redirect_uri.
 */
export async function exchangeEmbeddedSignupCode(config, code) {
    const response = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: {
            client_id: config.appId,
            client_secret: config.appSecret,
            code,
        },
    });
    return response.data;
}
/**
 * Get long-lived user access token (required for business accounts)
 */
export async function getLongLivedToken(config, shortLivedToken) {
    const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
            grant_type: 'fb_exchange_token',
            client_id: config.appId,
            client_secret: config.appSecret,
            fb_exchange_token: shortLivedToken,
        },
    });
    return response.data;
}
/**
 * Get WhatsApp Business Accounts for the user
 */
export async function getWhatsAppBusinessAccounts(userAccessToken) {
    // First get the user's pages/businesses
    const meResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
            access_token: userAccessToken,
            fields: 'id,name',
        },
    });
    const userId = meResponse.data.id;
    if (!userId) {
        throw new Error('Could not get user ID from Meta');
    }
    // Get WhatsApp Business Accounts. A Business's WABAs are split across two edges:
    // ones it owns outright, and ones it only has client access to (e.g. shared by a
    // Tech Provider partner) — there is no single combined "whatsapp_business_accounts" field.
    const wabaResponse = await axios.get(`https://graph.facebook.com/v18.0/${userId}/businesses`, {
        params: {
            access_token: userAccessToken,
            fields: 'id,name,' +
                'owned_whatsapp_business_accounts{id,name,country,timezone,currency,message_template_namespace},' +
                'client_whatsapp_business_accounts{id,name,country,timezone,currency,message_template_namespace}',
        },
    });
    const businesses = wabaResponse.data?.data || [];
    const wabaAccounts = [];
    const seenIds = new Set();
    for (const business of businesses) {
        const accounts = [
            ...(business.owned_whatsapp_business_accounts?.data || []),
            ...(business.client_whatsapp_business_accounts?.data || []),
        ];
        for (const account of accounts) {
            if (seenIds.has(account.id))
                continue;
            seenIds.add(account.id);
            wabaAccounts.push({
                id: account.id,
                name: account.name,
                country: account.country,
                timezone: account.timezone,
                currency: account.currency,
                message_template_namespace: account.message_template_namespace,
            });
        }
    }
    return wabaAccounts;
}
/**
 * Get phone numbers associated with a WhatsApp Business Account
 */
export async function getPhoneNumbers(userAccessToken, wabaId) {
    const response = await axios.get(`https://graph.facebook.com/v18.0/${wabaId}/phone_numbers`, {
        params: {
            access_token: userAccessToken,
        },
    });
    return response.data?.data || [];
}
/**
 * Request phone number verification (Embedded Signup)
 */
export async function requestPhoneVerification(config, wabaId, phoneNumber) {
    try {
        const response = await axios.post(`https://graph.facebook.com/v18.0/${wabaId}/request_code`, {
            phone_number: phoneNumber,
            verification_method: 'SMS',
        }, {
            params: {
                access_token: config.appId + '|' + config.appSecret, // App access token
            },
        });
        return {
            success: true,
            request_id: response.data.id,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.response?.data?.error?.message || 'Failed to request verification',
        };
    }
}
/**
 * Verify phone number with code
 */
export async function verifyPhoneCode(config, wabaId, requestId, code) {
    try {
        const response = await axios.post(`https://graph.facebook.com/v18.0/${wabaId}/verify_phone_number`, {
            request_id: requestId,
            code: code,
        }, {
            params: {
                access_token: config.appId + '|' + config.appSecret,
            },
        });
        return {
            success: true,
            phone_number_id: response.data.id,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.response?.data?.error?.message || 'Failed to verify code',
        };
    }
}
/**
 * Verify phone number ownership and get details
 * Used when connecting an existing phone number from a WABA
 */
export async function verifyPhoneNumber(userAccessToken, wabaId, phoneNumberId) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
            params: {
                access_token: userAccessToken,
                fields: 'id,display_phone_number,verified_name,quality_score,certificate',
            },
        });
        const data = response.data;
        if (!data.id)
            return null;
        return {
            id: data.id,
            display_phone_number: data.display_phone_number,
            verified_name: data.verified_name,
            quality_score: data.quality_score || 'UNKNOWN',
            certificate: data.certificate || '',
        };
    }
    catch (error) {
        console.error('Failed to verify phone number:', error.message);
        return null;
    }
}
/**
 * Set up webhook for WhatsApp Business Account
 */
export async function setupWebhook(userAccessToken, wabaId, callbackUrl, verifyToken) {
    try {
        // First, subscribe the WABA to the app's webhook
        await axios.post(`https://graph.facebook.com/v18.0/${wabaId}/subscribed_apps`, {}, {
            params: {
                access_token: userAccessToken,
            },
        });
        // Then update the app's webhook settings. This configures the APP's
        // global webhook subscription — Meta's /me/subscriptions endpoint only
        // accepts an app access token (`{app-id}|{app-secret}`) here, not a
        // per-tenant user token; passing the user token made `me` resolve to
        // the user (who doesn't support /subscriptions) instead of the app, so
        // this call was silently failing on every connection. With no App
        // ID/Secret configured, skip it rather than send a token we can't build.
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (appId && appSecret) {
            await axios.post(`https://graph.facebook.com/v18.0/${appId}/subscriptions`, new URLSearchParams({
                object: 'whatsapp_business_account',
                callback_url: callbackUrl,
                verify_token: verifyToken,
                // `message_deliveries`/`message_reads`/`message_reactions`/
                // `messages_controls`/`phone_number_id`/`wam_id` are legacy
                // On-Premises API fields this app's permission level rejects
                // outright on Cloud API — and this call is all-or-nothing, so
                // including even one invalid field fails the ENTIRE subscription,
                // silently blocking `message_template_status_update` too. Cloud
                // API delivery/read/failed status already arrives bundled inside
                // `messages` itself (as the `statuses` array webhooks.ts already
                // reads) — confirmed live: DELIVERED/READ ticks already work with
                // just this field.
                fields: ['messages', 'message_template_status_update'].join(','),
            }), {
                params: {
                    access_token: `${appId}|${appSecret}`,
                },
            });
        }
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error.response?.data?.error?.message || 'Failed to setup webhook',
        };
    }
}
/**
 * Get phone number quality and status from Meta
 */
export async function getPhoneNumberQuality(userAccessToken, phoneNumberId) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
            params: {
                access_token: userAccessToken,
                fields: 'quality_score,messaging_limit_tier,verified_name,display_phone_number',
            },
        });
        const data = response.data;
        return {
            quality_score: data.quality_score || 'UNKNOWN',
            can_send: data.messaging_limit_tier > 0,
            messaging_limit_tier: data.messaging_limit_tier || 0,
        };
    }
    catch (error) {
        return {
            quality_score: 'UNKNOWN',
            can_send: false,
            messaging_limit_tier: 0,
            error: error.response?.data?.error?.message || 'Failed to get quality',
        };
    }
}
/**
 * Generate a random webhook verify token
 */
export function generateWebhookVerifyToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
//# sourceMappingURL=metaOAuth.js.map
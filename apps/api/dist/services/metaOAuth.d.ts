/**
 * Meta OAuth & Embedded Signup Service
 * Handles WhatsApp Business API onboarding via Meta's official OAuth flow
 */
export interface MetaOAuthConfig {
    appId: string;
    appSecret: string;
    redirectUri: string;
}
interface MetaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}
interface WhatsAppBusinessAccount {
    id: string;
    name: string;
    country: string;
    timezone: string;
    currency: string;
    message_template_namespace: string;
}
interface PhoneNumber {
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_score: string;
    certificate: string;
}
/**
 * Get Meta OAuth URL for user authorization
 */
export declare function getMetaAuthUrl(config: MetaOAuthConfig, state: string): string;
/**
 * Exchange authorization code for user access token
 */
export declare function exchangeCodeForToken(config: MetaOAuthConfig, code: string): Promise<MetaTokenResponse>;
/**
 * Exchange the authorization code returned by the Embedded Signup JS SDK
 * (FB.login with config_id) for an access token. Unlike the classic OAuth
 * redirect flow, this code is not tied to a redirect_uri.
 */
export declare function exchangeEmbeddedSignupCode(config: MetaOAuthConfig, code: string): Promise<MetaTokenResponse>;
/**
 * Get long-lived user access token (required for business accounts)
 */
export declare function getLongLivedToken(config: MetaOAuthConfig, shortLivedToken: string): Promise<MetaTokenResponse>;
/**
 * Get WhatsApp Business Accounts for the user
 */
export declare function getWhatsAppBusinessAccounts(userAccessToken: string): Promise<WhatsAppBusinessAccount[]>;
/**
 * Get phone numbers associated with a WhatsApp Business Account
 */
export declare function getPhoneNumbers(userAccessToken: string, wabaId: string): Promise<PhoneNumber[]>;
/**
 * Request phone number verification (Embedded Signup)
 */
export declare function requestPhoneVerification(config: MetaOAuthConfig, wabaId: string, phoneNumber: string): Promise<{
    success: boolean;
    request_id?: string;
    error?: string;
}>;
/**
 * Verify phone number with code
 */
export declare function verifyPhoneCode(config: MetaOAuthConfig, wabaId: string, requestId: string, code: string): Promise<{
    success: boolean;
    phone_number_id?: string;
    error?: string;
}>;
/**
 * Verify phone number ownership and get details
 * Used when connecting an existing phone number from a WABA
 */
export declare function verifyPhoneNumber(userAccessToken: string, wabaId: string, phoneNumberId: string): Promise<PhoneNumber | null>;
/**
 * Set up webhook for WhatsApp Business Account
 */
export declare function setupWebhook(userAccessToken: string, wabaId: string, callbackUrl: string, verifyToken: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get phone number quality and status from Meta
 */
export declare function getPhoneNumberQuality(userAccessToken: string, phoneNumberId: string): Promise<{
    quality_score: string;
    can_send: boolean;
    messaging_limit_tier: number;
    error?: string;
}>;
/**
 * Generate a random webhook verify token
 */
export declare function generateWebhookVerifyToken(): string;
export {};
//# sourceMappingURL=metaOAuth.d.ts.map
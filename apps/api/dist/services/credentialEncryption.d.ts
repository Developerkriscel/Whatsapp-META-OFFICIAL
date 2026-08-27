/**
 * Encrypts/decrypts tenant WhatsApp credentials (access tokens, app secrets) at rest.
 * Uses AES-256-GCM with a key derived from CREDENTIALS_ENCRYPTION_KEY.
 */
export declare function encryptSecret(plaintext: string): string;
export declare function decryptSecret(value: string): string;
export declare function decryptIfPresent(value: string | null | undefined): string | undefined;
/**
 * Picks the Meta access token for a call: the phone number's own token when it
 * has one, otherwise the tenant-level credential.
 *
 * Both are stored encrypted. Phone tokens were previously written in plaintext,
 * and decryptSecret passes non-"enc:" values through unchanged, so rows written
 * before the backfill keep working without a special case here.
 */
export declare function resolveAccessToken(phoneToken: string | null | undefined, credentialsToken: string | null | undefined): string | null;
//# sourceMappingURL=credentialEncryption.d.ts.map
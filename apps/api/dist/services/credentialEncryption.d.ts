/**
 * Encrypts/decrypts tenant WhatsApp credentials (access tokens, app secrets) at rest.
 * Uses AES-256-GCM with a key derived from CREDENTIALS_ENCRYPTION_KEY.
 */
export declare function encryptSecret(plaintext: string): string;
export declare function decryptSecret(value: string): string;
export declare function decryptIfPresent(value: string | null | undefined): string | undefined;
//# sourceMappingURL=credentialEncryption.d.ts.map
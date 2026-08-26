/**
 * Encrypts/decrypts tenant WhatsApp credentials (access tokens, app secrets) at rest.
 * Uses AES-256-GCM with a key derived from CREDENTIALS_ENCRYPTION_KEY.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not set');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

// Values stored before encryption was introduced are plain strings without the
// "enc:" prefix - pass those through unchanged so existing credentials keep working.
export function decryptSecret(value: string): string {
  if (!value.startsWith('enc:')) {
    return value;
  }
  const [, ivB64, tagB64, dataB64] = value.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    return value;
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function decryptIfPresent(value: string | null | undefined): string | undefined {
  return value ? decryptSecret(value) : undefined;
}

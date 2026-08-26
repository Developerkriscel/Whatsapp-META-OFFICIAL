import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret, decryptIfPresent } from './credentialEncryption.js';

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key-not-for-production-use';
});

describe('credentialEncryption', () => {
  it('round-trips a plaintext secret through encrypt/decrypt', () => {
    const plaintext = 'EAAVWqALKnX8BSOzpKDytOUS4vlZBENl3SACNGg1ez1UTOl3HJW9';
    const ciphertext = encryptSecret(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.startsWith('enc:')).toBe(true);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const plaintext = 'same-secret-value';
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);

    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it('passes through legacy plaintext values that predate encryption', () => {
    const legacyPlaintext = 'a-token-stored-before-encryption-was-added';
    expect(decryptSecret(legacyPlaintext)).toBe(legacyPlaintext);
  });

  it('decryptIfPresent returns undefined for null/undefined and decrypts otherwise', () => {
    expect(decryptIfPresent(null)).toBeUndefined();
    expect(decryptIfPresent(undefined)).toBeUndefined();

    const ciphertext = encryptSecret('hello');
    expect(decryptIfPresent(ciphertext)).toBe('hello');
  });

  it('fails to decrypt if the ciphertext was tampered with', () => {
    const ciphertext = encryptSecret('sensitive-value');
    const parts = ciphertext.split(':');
    // Flip a character in the encrypted payload to simulate tampering.
    const tamperedData = parts[3].slice(0, -1) + (parts[3].at(-1) === 'A' ? 'B' : 'A');
    const tampered = [parts[0], parts[1], parts[2], tamperedData].join(':');

    expect(() => decryptSecret(tampered)).toThrow();
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './crypto.server';

describe('Crypto utils', () => {
  beforeAll(() => {
    // Set test encryption secret
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64); // 256-bit hex
  });

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'my-secret-token';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'same-secret';
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2); // Different IVs
  });

  it('should throw error if ENCRYPTION_SECRET not set', () => {
    delete process.env.ENCRYPTION_SECRET;

    expect(() => encrypt('test')).toThrow('ENCRYPTION_SECRET not configured');
  });
});

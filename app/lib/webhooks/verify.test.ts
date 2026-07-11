import { describe, it, expect, beforeAll } from 'vitest';
import { verifyWebhook } from './verify.server';
import crypto from 'crypto';

describe('Webhook HMAC verification', () => {
  const testSecret = 'test_secret_key';

  beforeAll(() => {
    process.env.SHOPIFY_API_SECRET = testSecret;
  });

  it('should verify valid HMAC signature', () => {
    const body = JSON.stringify({ id: 123, title: 'Test' });
    const hmac = crypto
      .createHmac('sha256', testSecret)
      .update(body, 'utf8')
      .digest('base64');

    const result = verifyWebhook(body, hmac);
    expect(result).toBe(true);
  });

  it('should reject invalid HMAC signature', () => {
    const body = JSON.stringify({ id: 123 });
    const fakeHmac = 'invalid_signature';

    const result = verifyWebhook(body, fakeHmac);
    expect(result).toBe(false);
  });

  it('should reject tampered body', () => {
    const body = JSON.stringify({ id: 123 });
    const hmac = crypto
      .createHmac('sha256', testSecret)
      .update(body, 'utf8')
      .digest('base64');

    const tamperedBody = JSON.stringify({ id: 999 });
    const result = verifyWebhook(tamperedBody, hmac);
    expect(result).toBe(false);
  });
});

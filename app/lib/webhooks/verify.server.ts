import crypto from 'crypto';

export function verifyWebhook(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    throw new Error('SHOPIFY_API_SECRET not configured');
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(hash)
    );
  } catch {
    return false;
  }
}

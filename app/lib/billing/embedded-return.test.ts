import { describe, it, expect } from 'vitest';
import { embeddedContextParams, fallbackHost } from './embedded-return.server';

const SHOP = 'test-shop.myshopify.com';
const HOST_FROM_URL = Buffer.from('admin.shopify.com/store/altro', 'utf8').toString('base64');

describe('fallbackHost', () => {
  it('ricostruisce il host nella forma usata dall admin', () => {
    expect(Buffer.from(fallbackHost(SHOP), 'base64').toString('utf8')).toBe(
      'admin.shopify.com/store/test-shop',
    );
  });
});

describe('embeddedContextParams', () => {
  it('preferisce il host della richiesta in corso', () => {
    const params = embeddedContextParams({
      requestUrl: new URL(`https://app/billing/subscribe?host=${HOST_FROM_URL}`),
      shopDomain: SHOP,
    });
    expect(params.get('host')).toBe(HOST_FROM_URL);
    expect(params.get('shop')).toBe(SHOP);
    expect(params.get('embedded')).toBe('1');
  });

  it('ripiega sul host passato dal client quando l URL non ce l ha', () => {
    const params = embeddedContextParams({
      requestUrl: new URL('https://app/billing/subscribe'),
      shopDomain: SHOP,
      host: HOST_FROM_URL,
    });
    expect(params.get('host')).toBe(HOST_FROM_URL);
  });

  it('senza nessuna fonte ricalcola il host dal dominio del negozio', () => {
    const params = embeddedContextParams({ requestUrl: null, shopDomain: SHOP });
    expect(params.get('host')).toBe(fallbackHost(SHOP));
  });
});

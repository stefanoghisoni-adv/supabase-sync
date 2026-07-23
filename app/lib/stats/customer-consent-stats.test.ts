import { describe, it, expect } from 'vitest';
import { countMarketingConsent, isCustomerOptedIn } from './customer-consent-stats';
import type { ShopifyCustomer } from '~/types/shopify';

const c = (over: Partial<ShopifyCustomer>): ShopifyCustomer =>
  ({ id: 1, email: null, phone: null, first_name: null, last_name: null, ...over } as ShopifyCustomer);

describe('isCustomerOptedIn', () => {
  it('consenso nidificato subscribed → true', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'subscribed' } }))).toBe(true);
  });
  it('unsubscribed → false', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'unsubscribed' } }))).toBe(false);
  });
  it('pending → false', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'pending' } }))).toBe(false);
  });
  it('senza consenso nidificato usa il campo legacy', () => {
    expect(isCustomerOptedIn(c({ accepts_marketing: true }))).toBe(true);
    expect(isCustomerOptedIn(c({ accepts_marketing: false }))).toBe(false);
  });
  it('nessuna informazione → false', () => {
    expect(isCustomerOptedIn(c({}))).toBe(false);
  });
});

describe('countMarketingConsent', () => {
  it('conta opt-in e opt-out', () => {
    const rows = [
      c({ email_marketing_consent: { state: 'subscribed' } }),
      c({ email_marketing_consent: { state: 'unsubscribed' } }),
      c({ accepts_marketing: true }),
    ];
    expect(countMarketingConsent(rows)).toEqual({ optIn: 2, optOut: 1 });
  });
  it('array vuoto → zeri', () => {
    expect(countMarketingConsent([])).toEqual({ optIn: 0, optOut: 0 });
  });
});

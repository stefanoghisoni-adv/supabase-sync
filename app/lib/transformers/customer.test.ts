import { describe, it, expect } from 'vitest';
import { transformCustomer } from './customer.server';
import type { ShopifyCustomer } from '~/types/shopify';

const base: ShopifyCustomer = {
  id: 123,
  email: 'jane@example.com',
  phone: '+15551234567',
  first_name: 'Jane',
  last_name: 'Doe',
  total_spent: '42.50',
  orders_count: 3,
  state: 'enabled',
  tags: 'vip, wholesale',
  note: 'good customer',
  verified_email: true,
  tax_exempt: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

describe('transformCustomer', () => {
  it('maps core fields, parses total_spent, and splits tags', () => {
    const row = transformCustomer(base);

    expect(row.shopify_customer_id).toBe(123);
    expect(row.email).toBe('jane@example.com');
    expect(row.total_spent).toBe(42.5);
    expect(row.orders_count).toBe(3);
    expect(row.customer_state).toBe('enabled');
    expect(row.tags).toEqual(['vip', 'wholesale']);
    expect(typeof row.synced_at).toBe('string');
  });

  it('prefers nested email_marketing_consent over legacy fields', () => {
    const row = transformCustomer({
      ...base,
      accepts_marketing: false,
      marketing_opt_in_level: 'single_opt_in',
      email_marketing_consent: { state: 'subscribed', opt_in_level: 'confirmed_opt_in' },
    });

    expect(row.accepts_marketing).toBe(true);
    expect(row.marketing_opt_in_level).toBe('confirmed_opt_in');
  });

  it('falls back to legacy accepts_marketing when consent object is absent', () => {
    const row = transformCustomer({
      ...base,
      accepts_marketing: true,
      marketing_opt_in_level: 'single_opt_in',
      email_marketing_consent: null,
    });

    expect(row.accepts_marketing).toBe(true);
    expect(row.marketing_opt_in_level).toBe('single_opt_in');
  });

  it('normalizes empty tags and missing optional fields to null', () => {
    const row = transformCustomer({
      id: 9,
      email: null,
      phone: null,
      first_name: null,
      last_name: null,
    });

    expect(row.tags).toEqual([]);
    expect(row.total_spent).toBeNull();
    expect(row.orders_count).toBeNull();
    expect(row.accepts_marketing).toBeNull();
  });
});

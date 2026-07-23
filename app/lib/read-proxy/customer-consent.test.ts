import { describe, it, expect } from 'vitest';
import {
  IDENTIFIER_COLUMNS,
  isCustomerIdentifierLookup,
  consentCheckSearch,
  forceConsentedOnlySearch,
  rowsHaveNonConsented,
} from './customer-consent.server';

describe('customer-consent', () => {
  describe('IDENTIFIER_COLUMNS', () => {
    it('includes id, email, phone, shopify_customer_id', () => {
      expect(IDENTIFIER_COLUMNS).toEqual(['id', 'email', 'phone', 'shopify_customer_id']);
    });
  });

  describe('isCustomerIdentifierLookup', () => {
    it('id=eq.abc → true', () => {
      expect(isCustomerIdentifierLookup('?id=eq.abc')).toBe(true);
    });
    it('email=eq.x → true', () => {
      expect(isCustomerIdentifierLookup('?email=eq.foo@bar.com')).toBe(true);
    });
    it('shopify_customer_id=eq.1 → true', () => {
      expect(isCustomerIdentifierLookup('?shopify_customer_id=eq.1')).toBe(true);
    });
    it('phone=eq.+39 → true', () => {
      expect(isCustomerIdentifierLookup('?phone=eq.+390000')).toBe(true);
    });
    it('nessun eq identificativo → false', () => {
      expect(isCustomerIdentifierLookup('?select=*&limit=3')).toBe(false);
    });
    it('eq su colonna non identificativa → false', () => {
      expect(isCustomerIdentifierLookup('?last_name=eq.Rossi')).toBe(false);
    });
  });

  describe('consentCheckSearch', () => {
    it('preserva il filtro e imposta select=accepts_marketing', () => {
      const out = consentCheckSearch('?email=eq.foo@bar.com&select=*');
      const p = new URLSearchParams(out);
      expect(p.get('select')).toBe('accepts_marketing');
      expect(p.get('email')).toBe('eq.foo@bar.com');
    });

    it('rimuove limit e offset, preserva filtri', () => {
      const out = consentCheckSearch('?phone=eq.x&limit=1&offset=2');
      const p = new URLSearchParams(out);
      expect(p.get('select')).toBe('accepts_marketing');
      expect(p.get('phone')).toBe('eq.x');
      expect(p.has('limit')).toBe(false);
      expect(p.has('offset')).toBe(false);
    });
  });

  describe('forceConsentedOnlySearch', () => {
    it('da ?select=* aggiunge il filtro consenzienti', () => {
      expect(forceConsentedOnlySearch('?select=*')).toBe('?select=*&accepts_marketing=eq.true');
    });
    it('da stringa vuota parte con ?', () => {
      expect(forceConsentedOnlySearch('')).toBe('?accepts_marketing=eq.true');
    });
  });

  describe('rowsHaveNonConsented', () => {
    it('tutti true → false', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: true }])).toBe(false);
    });
    it('un false → true', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: true }, { accepts_marketing: false }])).toBe(true);
    });
    it('null → true', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: null }])).toBe(true);
    });
    it('vuoto → false', () => {
      expect(rowsHaveNonConsented([])).toBe(false);
    });
  });
});

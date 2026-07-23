import { describe, it, expect } from 'vitest';
import {
  isCustomerIdentifierLookup,
  consentCheckSearch,
  forceConsentedOnlySearch,
  rowsHaveNonConsented,
} from './customer-consent.server';

describe('customer-consent', () => {
  describe('isCustomerIdentifierLookup', () => {
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

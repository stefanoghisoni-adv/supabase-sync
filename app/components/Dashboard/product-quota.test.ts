import { describe, it, expect } from 'vitest';
import {
  productQuotaLabel,
  productLimitThreshold,
  isNearProductLimit,
  productLimitMessage,
} from './product-quota';

describe('productQuotaLabel', () => {
  it('affianca il tetto del piano al conteggio', () => {
    expect(productQuotaLabel(54, 100)).toBe('54 / 100');
  });

  it('piano senza tetto → infinito', () => {
    expect(productQuotaLabel(54, null)).toBe('54 / ∞');
    expect(productQuotaLabel(0, undefined)).toBe('0 / ∞');
  });
});

describe('productLimitThreshold', () => {
  it("l'85% arrotondato per eccesso", () => {
    expect(productLimitThreshold(100)).toBe(85);
    expect(productLimitThreshold(20)).toBe(17);
    expect(productLimitThreshold(3)).toBe(3);
  });
});

describe('isNearProductLimit', () => {
  it('sotto la soglia non avvisa', () => {
    expect(isNearProductLimit(84, 100)).toBe(false);
  });

  it('dalla soglia in su avvisa', () => {
    expect(isNearProductLimit(85, 100)).toBe(true);
    expect(isNearProductLimit(99, 100)).toBe(true);
    expect(isNearProductLimit(140, 100)).toBe(true);
  });

  it('piano senza tetto → mai', () => {
    expect(isNearProductLimit(9999, null)).toBe(false);
    expect(isNearProductLimit(9999, 0)).toBe(false);
  });
});

describe('productLimitMessage', () => {
  it('sotto la soglia non dice nulla', () => {
    expect(productLimitMessage(10, 100)).toBeNull();
    expect(productLimitMessage(9999, null)).toBeNull();
  });

  it('vicino al tetto avvisa al futuro', () => {
    const msg = productLimitMessage(90, 100);
    expect(msg).toContain('Stai per raggiungere');
    expect(msg).toContain('90 di 100');
    expect(msg).toContain('non verranno sincronizzati');
  });

  it('tetto raggiunto o superato → non "stai per"', () => {
    // A quota piena il merchant ha gia' prodotti che restano fuori: dirgli che
    // "sta per" arrivarci sarebbe falso.
    const msg = productLimitMessage(100, 100);
    expect(msg).toContain('Hai raggiunto');
    expect(msg).not.toContain('Stai per');
    expect(productLimitMessage(130, 100)).toContain('Hai raggiunto');
  });
});

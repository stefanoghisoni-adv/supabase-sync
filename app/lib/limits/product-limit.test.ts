import { describe, it, expect } from 'vitest';
import { limitProducts, isProductLimitReached } from './product-limit';

describe('limitProducts', () => {
  it('ritorna tutti i prodotti quando il limite è null (illimitato)', () => {
    expect(limitProducts([1, 2, 3], 0, null)).toEqual([1, 2, 3]);
    expect(limitProducts([1, 2, 3], 100, undefined)).toEqual([1, 2, 3]);
  });

  it('tronca la pagina per non superare il limite cumulativo', () => {
    // limite 50, già presi 48 → si possono prendere solo 2 di questa pagina
    expect(limitProducts([1, 2, 3, 4, 5], 48, 50)).toEqual([1, 2]);
  });

  it('ritorna lista vuota quando il limite è già raggiunto', () => {
    expect(limitProducts([1, 2, 3], 50, 50)).toEqual([]);
    expect(limitProducts([1, 2, 3], 60, 50)).toEqual([]);
  });

  it('ritorna la pagina intera se rientra nel limite', () => {
    expect(limitProducts([1, 2, 3], 10, 50)).toEqual([1, 2, 3]);
  });
});

describe('isProductLimitReached', () => {
  it('mai raggiunto con limite illimitato', () => {
    expect(isProductLimitReached(9999, null)).toBe(false);
    expect(isProductLimitReached(9999, undefined)).toBe(false);
  });

  it('raggiunto quando i presi eguagliano o superano il limite', () => {
    expect(isProductLimitReached(50, 50)).toBe(true);
    expect(isProductLimitReached(51, 50)).toBe(true);
  });

  it('non raggiunto sotto il limite', () => {
    expect(isProductLimitReached(49, 50)).toBe(false);
  });
});

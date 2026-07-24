import { describe, it, expect } from 'vitest';
import {
  isProductRowEligible,
  filterEligibleProductRows,
} from './product-eligibility';
import type { SupabaseProductRow } from '~/types/shopify';

// Per l'idoneità servono cost_per_item e net_value; price serve per calcolare
// net_value nei casi con costo zero. Le altre colonne non servono al test.
const row = (
  cost: number | null,
  netValue: number | null,
  variantId: number,
  price = 100,
): SupabaseProductRow =>
  ({
    shopify_variant_id: variantId,
    cost_per_item: cost,
    net_value: netValue,
    price,
  } as unknown as SupabaseProductRow);

describe('product-eligibility', () => {
  it('cost_per_item null → non idoneo', () => {
    expect(isProductRowEligible(row(null, null, 1))).toBe(false);
  });

  it('cost_per_item 0 → idoneo (costo esplicito)', () => {
    expect(isProductRowEligible(row(0, 100, 1, 100))).toBe(true);
  });

  it('cost_per_item positivo → idoneo', () => {
    expect(isProductRowEligible(row(12.5, 87.5, 1, 100))).toBe(true);
  });

  it('filterEligibleProductRows tiene solo le righe con costo', () => {
    const rows = [
      row(10, 90, 1),
      row(null, null, 2),
      row(0, 100, 3, 100),
      row(null, null, 4),
    ];
    const kept = filterEligibleProductRows(rows);
    expect(kept.map((r) => r.shopify_variant_id)).toEqual([1, 3]);
  });

  // --- Nuovi test per net_value ---

  it('riga con costo e net_value valorizzato → idonea', () => {
    expect(isProductRowEligible(row(4.35, 15.55, 1, 19.90))).toBe(true);
  });

  it('riga con costo ma net_value: null → NON idonea', () => {
    expect(isProductRowEligible(row(4.35, null, 1, 19.90))).toBe(false);
  });

  it('riga con cost_per_item: 0 e net_value pari al prezzo → idonea (nessuna regressione)', () => {
    expect(isProductRowEligible(row(0, 50, 1, 50))).toBe(true);
  });
});

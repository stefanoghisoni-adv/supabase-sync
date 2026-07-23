import { describe, it, expect } from 'vitest';
import {
  isProductRowEligible,
  filterEligibleProductRows,
} from './product-eligibility';
import type { SupabaseProductRow } from '~/types/shopify';

// Solo cost_per_item conta per l'idoneità: le altre colonne non servono al test.
const row = (cost: number | null, variantId: number): SupabaseProductRow =>
  ({ shopify_variant_id: variantId, cost_per_item: cost } as unknown as SupabaseProductRow);

describe('product-eligibility', () => {
  it('cost_per_item null → non idoneo', () => {
    expect(isProductRowEligible(row(null, 1))).toBe(false);
  });

  it('cost_per_item 0 → idoneo (costo esplicito)', () => {
    expect(isProductRowEligible(row(0, 1))).toBe(true);
  });

  it('cost_per_item positivo → idoneo', () => {
    expect(isProductRowEligible(row(12.5, 1))).toBe(true);
  });

  it('filterEligibleProductRows tiene solo le righe con costo', () => {
    const rows = [row(10, 1), row(null, 2), row(0, 3), row(null, 4)];
    const kept = filterEligibleProductRows(rows);
    expect(kept.map((r) => r.shopify_variant_id)).toEqual([1, 3]);
  });
});

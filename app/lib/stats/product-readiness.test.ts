import { describe, it, expect } from 'vitest';
import { isVariantReady, computeProductReadiness } from './product-readiness';
import type { ShopifyProduct } from '~/types/shopify';

function makeProduct(costs: (string | null)[]): ShopifyProduct {
  return {
    id: 1, title: 't', body_html: '', vendor: '', product_type: '', handle: 'h',
    status: 'active', tags: '', published_at: null,
    variants: costs.map((cost, i) => ({
      id: i + 1, product_id: 1, title: `v${i}`, sku: '', barcode: null,
      price: '10.00', compare_at_price: null, cost, position: i + 1,
      inventory_quantity: 0, weight: 0, weight_unit: 'kg',
      requires_shipping: true, taxable: true, image_id: null,
      option1: null, option2: null, option3: null,
    })),
  };
}

describe('isVariantReady', () => {
  it('is true when cost is a non-empty string (including "0.00")', () => {
    expect(isVariantReady('12.50')).toBe(true);
    expect(isVariantReady('0.00')).toBe(true);
  });
  it('is false when cost is null, undefined or blank', () => {
    expect(isVariantReady(null)).toBe(false);
    expect(isVariantReady(undefined)).toBe(false);
    expect(isVariantReady('   ')).toBe(false);
  });
});

describe('computeProductReadiness', () => {
  it('counts products and classifies each variant by cost', () => {
    const products = [makeProduct(['5.00', null]), makeProduct(['3.00'])];
    expect(computeProductReadiness(products)).toEqual({
      totalProducts: 2,
      readyCount: 2,
      problemCount: 1,
    });
  });
  it('returns zeros for an empty catalog', () => {
    expect(computeProductReadiness([])).toEqual({
      totalProducts: 0, readyCount: 0, problemCount: 0,
    });
  });
});

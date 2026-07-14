import type { ShopifyProduct } from '~/types/shopify';

export interface ProductReadinessCounts {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
}

export function isVariantReady(cost: string | null | undefined): boolean {
  return cost !== null && cost !== undefined && String(cost).trim() !== '';
}

export function computeProductReadiness(
  products: ShopifyProduct[],
): ProductReadinessCounts {
  let readyCount = 0;
  let problemCount = 0;
  for (const product of products) {
    for (const variant of product.variants) {
      if (isVariantReady(variant.cost)) readyCount++;
      else problemCount++;
    }
  }
  return { totalProducts: products.length, readyCount, problemCount };
}

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

// Riga di dettaglio per la tabella "Prodotti con problemi": una variante a cui
// manca il valore richiesto (oggi cost_per_item, coerente con problemCount).
export interface ProblemVariant {
  productId: number;
  productTitle: string;
  variantId: number;
  variantTitle: string;
  sku: string | null;
  missingField: 'cost_per_item';
}

export function collectProblemVariants(
  products: ShopifyProduct[],
): ProblemVariant[] {
  const rows: ProblemVariant[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (isVariantReady(variant.cost)) continue;
      rows.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku ? variant.sku : null,
        missingField: 'cost_per_item',
      });
    }
  }
  return rows;
}

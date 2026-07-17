import type { ShopifyProduct, SupabaseProductRow } from '~/types/shopify';

export function transformProduct(product: ShopifyProduct): SupabaseProductRow[] {
  const hasMultipleVariants = product.variants.length > 1 ||
    (product.variants.length === 1 && product.variants[0].title !== 'Default Title');

  const tags = product.tags
    ? product.tags.split(',').map(tag => tag.trim()).filter(Boolean)
    : [];

  if (hasMultipleVariants) {
    // Product has variants → create row per variant
    return product.variants.map(variant => ({
      shopify_product_id: product.id,
      shopify_variant_id: variant.id,
      is_variant: true,

      // Product-level data (duplicated)
      product_title: product.title,
      product_description: product.body_html || null,
      vendor: product.vendor || null,
      product_type: product.product_type || null,
      handle: product.handle,
      product_status: product.status,
      tags,
      product_published_at: product.published_at,

      // Variant-level data
      variant_title: variant.title,
      sku: variant.sku || null,
      barcode: variant.barcode,
      price: parseFloat(variant.price),
      compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
      cost_per_item: variant.cost ? parseFloat(variant.cost) : null,
      position: variant.position,
      inventory_quantity:
        variant.inventory_management != null ? variant.inventory_quantity : null,
      inventory_tracked: variant.inventory_management != null,
      inventory_policy: variant.inventory_policy ?? null,
      weight: variant.weight,
      weight_unit: variant.weight_unit,
      requires_shipping: variant.requires_shipping,
      taxable: variant.taxable,
      image_url: getVariantImageUrl(product, variant),
      option1: variant.option1,
      option2: variant.option2,
      option3: variant.option3,

      synced_at: new Date().toISOString(),
    }));
  } else {
    // Product without "real" variants → single row. In Shopify anche questi
    // hanno UNA variante ("Default Title") con un id reale: lo usiamo come
    // shopify_variant_id così ogni riga ha una chiave univoca (evita l'upsert
    // su shopify_product_id, che non ha vincolo UNIQUE). is_variant resta false.
    const variant = product.variants[0];

    return [{
      shopify_product_id: product.id,
      shopify_variant_id: variant.id,
      is_variant: false,

      product_title: product.title,
      product_description: product.body_html || null,
      vendor: product.vendor || null,
      product_type: product.product_type || null,
      handle: product.handle,
      product_status: product.status,
      tags,
      product_published_at: product.published_at,

      variant_title: null,
      sku: variant.sku || null,
      barcode: variant.barcode,
      price: parseFloat(variant.price),
      compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
      cost_per_item: variant.cost ? parseFloat(variant.cost) : null,
      position: variant.position,
      inventory_quantity:
        variant.inventory_management != null ? variant.inventory_quantity : null,
      inventory_tracked: variant.inventory_management != null,
      inventory_policy: variant.inventory_policy ?? null,
      weight: variant.weight,
      weight_unit: variant.weight_unit,
      requires_shipping: variant.requires_shipping,
      taxable: variant.taxable,
      image_url: product.images?.[0]?.src || null,
      option1: null,
      option2: null,
      option3: null,

      synced_at: new Date().toISOString(),
    }];
  }
}

function getVariantImageUrl(product: ShopifyProduct, variant: { image_id: number | null }): string | null {
  if (!variant.image_id || !product.images) return null;
  const image = product.images.find(img => img.id === variant.image_id);
  return image?.src || null;
}

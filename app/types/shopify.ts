export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: 'active' | 'draft' | 'archived';
  tags: string;
  published_at: string | null;
  variants: ShopifyVariant[];
  images?: ShopifyImage[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string;
  barcode: string | null;
  price: string;
  compare_at_price: string | null;
  cost: string | null;
  position: number;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  requires_shipping: boolean;
  taxable: boolean;
  image_id: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
}

export interface SupabaseProductRow {
  shopify_product_id: number;
  shopify_variant_id: number | null;
  is_variant: boolean;
  product_title: string;
  product_description: string | null;
  vendor: string | null;
  product_type: string | null;
  handle: string;
  product_status: string;
  tags: string[];
  product_published_at: string | null;
  variant_title: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  compare_at_price: number | null;
  cost_per_item: number | null;
  position: number | null;
  inventory_quantity: number | null;
  weight: number | null;
  weight_unit: string | null;
  requires_shipping: boolean | null;
  taxable: boolean | null;
  image_url: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  synced_at: string;
}

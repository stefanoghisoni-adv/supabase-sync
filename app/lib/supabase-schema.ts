export const PRODUCTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id BIGINT NOT NULL,
  shopify_variant_id BIGINT UNIQUE,
  is_variant BOOLEAN DEFAULT true,
  product_title TEXT NOT NULL,
  product_description TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  product_status TEXT,
  tags TEXT[],
  product_published_at TIMESTAMP,
  variant_title TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(10, 2) NOT NULL,
  compare_at_price NUMERIC(10, 2),
  cost_per_item NUMERIC(10, 2),
  position INTEGER,
  inventory_quantity INTEGER,
  weight NUMERIC(10, 3),
  weight_unit TEXT,
  requires_shipping BOOLEAN,
  taxable BOOLEAN,
  image_url TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_variant
  ON products(shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(product_status);
`;

export const CUSTOMERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  accepts_marketing BOOLEAN,
  marketing_opt_in_level TEXT,
  total_spent NUMERIC(10, 2),
  orders_count INTEGER,
  customer_state TEXT,
  tags TEXT[],
  note TEXT,
  verified_email BOOLEAN,
  tax_exempt BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
`;

export const MERCHANT_TABLES_SQL = PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL;

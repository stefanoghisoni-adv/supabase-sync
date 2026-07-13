import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';

const PRODUCTS_TABLE_SQL = `
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

const CUSTOMERS_TABLE_SQL = `
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

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });

  if (!shop?.supabaseConfig) {
    return json({ error: 'Supabase not configured' }, { status: 400 });
  }

  try {
    const serviceRoleKey = decrypt(shop.supabaseConfig.supabaseServiceRoleKey);

    // Note: the Supabase JS client cannot run raw DDL. This calls an `exec_sql`
    // Postgres function that must exist in the merchant database (documented in
    // the setup instructions). Without it the request returns an error.
    const response = await fetch(
      `${shop.supabaseConfig.supabaseUrl}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create tables');
    }

    return json({ ok: true, message: 'Tables created successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

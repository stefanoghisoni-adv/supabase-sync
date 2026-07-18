// app/lib/supabase-schema.ts
// DDL idempotente e non distruttivo per le tabelle del merchant.
//
// Ogni tabella viene garantita in tre mosse, tutte sicure sui dati esistenti:
//  1. CREATE TABLE IF NOT EXISTS  → crea la tabella se manca
//  2. ALTER TABLE ADD COLUMN IF NOT EXISTS → allinea gli schemi vecchi aggiungendo
//     SOLO le colonne mancanti (nessun DROP: i dati presenti restano intatti)
//  3. indici + RLS, tutti IF NOT EXISTS / idempotenti
//
// Così un progetto Supabase pre-esistente con tabelle datate viene aggiornato
// alla configurazione corretta senza cancellare nulla.

interface Column {
  name: string;
  // Tipo base (usato anche nell'ALTER: niente vincoli che romperebbero su righe
  // esistenti, es. NOT NULL/UNIQUE). I default sono inclusi qui apposta.
  type: string;
  // Vincoli aggiuntivi applicati SOLO nel CREATE (tabella nuova, ancora vuota).
  constraints?: string;
}

const PRODUCTS_COLUMNS: Column[] = [
  { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
  { name: 'shopify_product_id', type: 'BIGINT', constraints: 'NOT NULL' },
  { name: 'shopify_variant_id', type: 'BIGINT', constraints: 'UNIQUE' },
  { name: 'is_variant', type: 'BOOLEAN DEFAULT true' },
  { name: 'product_title', type: 'TEXT', constraints: 'NOT NULL' },
  { name: 'product_description', type: 'TEXT' },
  { name: 'vendor', type: 'TEXT' },
  { name: 'product_type', type: 'TEXT' },
  { name: 'handle', type: 'TEXT' },
  { name: 'product_status', type: 'TEXT' },
  { name: 'tags', type: 'TEXT[]' },
  { name: 'product_published_at', type: 'TIMESTAMP' },
  { name: 'variant_title', type: 'TEXT' },
  { name: 'sku', type: 'TEXT' },
  { name: 'barcode', type: 'TEXT' },
  { name: 'price', type: 'NUMERIC(10, 2)', constraints: 'NOT NULL' },
  { name: 'compare_at_price', type: 'NUMERIC(10, 2)' },
  { name: 'cost_per_item', type: 'NUMERIC(10, 2)' },
  { name: 'position', type: 'INTEGER' },
  { name: 'inventory_quantity', type: 'INTEGER' },
  { name: 'inventory_tracked', type: 'BOOLEAN' },
  { name: 'inventory_policy', type: 'TEXT' },
  { name: 'weight', type: 'NUMERIC(10, 3)' },
  { name: 'weight_unit', type: 'TEXT' },
  { name: 'requires_shipping', type: 'BOOLEAN' },
  { name: 'taxable', type: 'BOOLEAN' },
  { name: 'image_url', type: 'TEXT' },
  { name: 'option1', type: 'TEXT' },
  { name: 'option2', type: 'TEXT' },
  { name: 'option3', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' },
  { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' },
  { name: 'synced_at', type: 'TIMESTAMP DEFAULT NOW()' },
];

const PRODUCTS_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_variant
  ON products(shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(shopify_product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);`,
  `CREATE INDEX IF NOT EXISTS idx_products_status ON products(product_status);`,
];

const CUSTOMERS_COLUMNS: Column[] = [
  { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()' },
  { name: 'shopify_customer_id', type: 'BIGINT', constraints: 'UNIQUE NOT NULL' },
  { name: 'email', type: 'TEXT' },
  { name: 'phone', type: 'TEXT' },
  { name: 'first_name', type: 'TEXT' },
  { name: 'last_name', type: 'TEXT' },
  { name: 'accepts_marketing', type: 'BOOLEAN' },
  { name: 'marketing_opt_in_level', type: 'TEXT' },
  { name: 'total_spent', type: 'NUMERIC(10, 2)' },
  { name: 'orders_count', type: 'INTEGER' },
  { name: 'customer_state', type: 'TEXT' },
  { name: 'tags', type: 'TEXT[]' },
  { name: 'note', type: 'TEXT' },
  { name: 'verified_email', type: 'BOOLEAN' },
  { name: 'tax_exempt', type: 'BOOLEAN' },
  { name: 'created_at', type: 'TIMESTAMP' },
  { name: 'updated_at', type: 'TIMESTAMP' },
  { name: 'synced_at', type: 'TIMESTAMP DEFAULT NOW()' },
];

const CUSTOMERS_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;`,
];

function columnCreateDef(col: Column): string {
  return `${col.name} ${col.type}${col.constraints ? ` ${col.constraints}` : ''}`;
}

function buildTableSQL(
  table: string,
  columns: Column[],
  indexes: string[],
): string {
  const createTable =
    `CREATE TABLE IF NOT EXISTS ${table} (\n  ` +
    columns.map(columnCreateDef).join(',\n  ') +
    `\n);`;

  // ALTER per allineare gli schemi datati: salta la PK (sempre presente) e
  // aggiunge le colonne mancanti col solo tipo base (mai NOT NULL/UNIQUE, che
  // fallirebbero su tabelle già popolate).
  const alters = columns
    .filter((c) => !c.constraints?.includes('PRIMARY KEY'))
    .map((c) => `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`)
    .join('\n');

  const rls = `-- RLS attiva (senza policy pubbliche): la tabella NON è accessibile via Data
-- API con la anon key. L'app scrive/legge con la service_role key, che bypassa RLS.
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`;

  return `\n${createTable}\n\n${alters}\n\n${indexes.join('\n')}\n\n${rls}\n`;
}

export function buildProductsSchemaSQL(): string {
  return buildTableSQL('products', PRODUCTS_COLUMNS, PRODUCTS_INDEXES);
}

export function buildCustomersSchemaSQL(): string {
  return buildTableSQL('customers', CUSTOMERS_COLUMNS, CUSTOMERS_INDEXES);
}

/**
 * DDL per le sole tabelle abilitate dal piano: `products` sempre, `customers`
 * solo se il piano include la sincronizzazione clienti.
 */
export function buildMerchantSchemaSQL(includeCustomers: boolean): string {
  return (
    buildProductsSchemaSQL() + (includeCustomers ? buildCustomersSchemaSQL() : '')
  );
}

// Compat: costanti pre-generate (usate dal path legacy create-tables e dai test).
export const PRODUCTS_TABLE_SQL = buildProductsSchemaSQL();
export const CUSTOMERS_TABLE_SQL = buildCustomersSchemaSQL();
export const MERCHANT_TABLES_SQL = PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL;

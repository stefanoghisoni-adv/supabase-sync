import type { SupabaseClient } from '@supabase/supabase-js';
import { buildProductsSchemaSQL } from '~/lib/supabase-schema';
import { ensureTable, type EnsureTableResult } from './ensure-table.server';

export type EnsureProductsTableResult = EnsureTableResult;

const DDL_TABLE_NAME = 'products';

interface ConfigLike {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseProjectRef: string | null;
  tableNameProducts: string;
}

/**
 * Garantisce che la tabella dei prodotti esista e sia raggiungibile prima di
 * scriverci.
 *
 * La tabella nasce al collegamento del database, ma fra la sua creazione e la
 * prima sincronizzazione l'API REST del progetto puo' non averla ancora nella
 * sua copia dello schema: la scrittura fallirebbe con "Could not find the table
 * 'public.products' in the schema cache" e si porterebbe dietro l'intera corsa.
 * Lo stesso vale se il database e' stato ricreato o svuotato dopo il
 * collegamento. Qui la tabella viene provveduta e attesa; se proprio non si
 * riesce, il chiamante ferma la corsa con un messaggio che dice cosa manca.
 */
export async function ensureProductsTable(
  shopId: string,
  config: ConfigLike,
  supabase: SupabaseClient,
): Promise<EnsureProductsTableResult> {
  return ensureTable(shopId, config, supabase, {
    ddlTableName: DDL_TABLE_NAME,
    tableName: config.tableNameProducts,
    probeColumn: 'shopify_variant_id',
    buildSQL: buildProductsSchemaSQL,
    label: 'ensureProductsTable',
  });
}

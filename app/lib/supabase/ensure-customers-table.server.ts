import type { SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '~/db.server';
import { buildCustomersSchemaSQL } from '~/lib/supabase-schema';
import { ensureTable, type EnsureTableResult } from './ensure-table.server';

/**
 * Stato della tabella clienti prima di sincronizzarla:
 * - `created`        : non c'era e l'abbiamo appena creata;
 * - `already_present`: c'era gia';
 * - `unavailable`    : non c'e' e non e' utilizzabile → il chiamante salta i
 *                      clienti senza far fallire la sync dei prodotti.
 *
 * `empty` dice se la tabella e' ancora senza righe: e' il segnale che decide
 * fra recupero completo e aggiornamento incrementale, e regge anche il caso in
 * cui la creazione avvenga in una corsa e il primo popolamento in quella dopo.
 */
export type EnsureCustomersTableResult = EnsureTableResult;

// Il nome che la DDL crea e' letterale (vedi buildTableSQL): possiamo provvedere
// solo a quello.
const DDL_TABLE_NAME = 'customers';

interface ConfigLike {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseProjectRef: string | null;
  tableNameCustomers: string;
}

/**
 * Garantisce che la tabella dei clienti esista e sia raggiungibile prima di
 * sincronizzarla.
 *
 * Serve al passaggio a un piano che include i clienti: al collegamento la
 * tabella viene creata solo se il piano di allora la prevedeva, quindi dopo un
 * upgrade puo' mancare del tutto. Senza questa verifica la prima sync clienti
 * fallirebbe e porterebbe con se' l'intera corsa (prodotti compresi).
 */
export async function ensureCustomersTable(
  shopId: string,
  config: ConfigLike,
  supabase: SupabaseClient,
): Promise<EnsureCustomersTableResult> {
  return ensureTable(shopId, config, supabase, {
    ddlTableName: DDL_TABLE_NAME,
    tableName: config.tableNameCustomers,
    probeColumn: 'shopify_customer_id',
    buildSQL: buildCustomersSchemaSQL,
    label: 'ensureCustomersTable',
    onCreated: () => logCreation(shopId),
  });
}

// Stesso evento che registra il collegamento quando crea le tabelle: il merchant
// lo ritrova nei log. Best effort — la tabella ormai c'e'.
async function logCreation(shopId: string): Promise<void> {
  try {
    await prisma.syncJob.create({
      data: {
        shopId,
        jobType: 'table_create_customers',
        status: 'completed',
        completedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn(
      '[ensureCustomersTable] log creazione tabella clienti fallito:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
  }
}

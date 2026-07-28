import type { SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { runQuery } from '~/lib/supabase-management.server';
import { buildCustomersSchemaSQL } from '~/lib/supabase-schema';
import { validateSupabaseUrl } from '~/utils/supabase-url.server';

/**
 * Esito della verifica della tabella clienti:
 * - `created`      : non c'era e l'abbiamo appena creata → non esiste storico,
 *                    la sync successiva deve fare un backfill COMPLETO.
 * - `already_present`: c'era gia' → la sync incrementale e' sufficiente.
 * - `unavailable`  : non c'e' e non siamo riusciti a crearla → il chiamante
 *                    salta i clienti senza far fallire la sync dei prodotti.
 */
export type EnsureCustomersTableResult = 'created' | 'already_present' | 'unavailable';

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
 * `true` se la tabella esiste, `false` se manca, `null` se non e' possibile
 * stabilirlo (errore di rete o risposta inattesa). Il `head` non scarica righe:
 * e' una chiamata di sola verifica.
 */
async function tableExists(
  supabase: SupabaseClient,
  table: string,
): Promise<boolean | null> {
  const { error } = await supabase.from(table).select('*', { head: true }).limit(1);
  if (!error) return true;

  const code = (error as { code?: string }).code ?? '';
  const message = error.message ?? '';
  // 42P01 e' il "undefined_table" di Postgres; PGRST205 e' il modo in cui
  // PostgREST dice che la tabella non e' nella sua cache dello schema.
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(message)
  ) {
    return false;
  }
  return null;
}

/** DDL via Management API (percorso OAuth). `false` se non praticabile. */
async function createViaManagementApi(shopId: string, ref: string): Promise<boolean> {
  try {
    const token = await getValidAccessToken(shopId);
    await runQuery(token, ref, buildCustomersSchemaSQL());
    return true;
  } catch (err) {
    console.warn(
      '[ensureCustomersTable] DDL via Management API non riuscita:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
    return false;
  }
}

/** DDL via funzione `exec_sql` con la service role key (percorso legacy). */
async function createViaExecSql(config: ConfigLike): Promise<boolean> {
  const urlCheck = validateSupabaseUrl(config.supabaseUrl);
  if (!urlCheck.ok || !urlCheck.url) return false;

  try {
    const serviceRoleKey = decrypt(config.supabaseServiceRoleKey);
    const res = await fetch(`${urlCheck.url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: buildCustomersSchemaSQL() }),
    });
    return res.ok;
  } catch (err) {
    console.warn(
      '[ensureCustomersTable] DDL via exec_sql non riuscita:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
    return false;
  }
}

/**
 * Garantisce che la tabella dei clienti esista prima di sincronizzarla.
 *
 * Serve al passaggio a un piano che include i clienti: al collegamento la
 * tabella viene creata solo se il piano di allora la prevedeva, quindi dopo un
 * upgrade puo' mancare del tutto. Senza questa verifica la prima sync clienti
 * fallirebbe e porterebbe con se' l'intera corsa (prodotti compresi).
 *
 * La DDL e' idempotente (CREATE TABLE IF NOT EXISTS) e non distruttiva: su una
 * tabella gia' presente non tocca i dati.
 */
export async function ensureCustomersTable(
  shopId: string,
  config: ConfigLike,
  supabase: SupabaseClient,
): Promise<EnsureCustomersTableResult> {
  const exists = await tableExists(supabase, config.tableNameCustomers);
  if (exists === true) return 'already_present';

  // Possiamo creare solo la tabella con il nome previsto dalla DDL: se il
  // negozio ne usa uno diverso, provvederla non e' compito nostro.
  if (config.tableNameCustomers !== DDL_TABLE_NAME) {
    console.warn(
      `[ensureCustomersTable] tabella "${config.tableNameCustomers}" non gestita dalla DDL: clienti saltati`,
    );
    return 'unavailable';
  }

  const created = config.supabaseProjectRef
    ? (await createViaManagementApi(shopId, config.supabaseProjectRef)) ||
      (await createViaExecSql(config))
    : await createViaExecSql(config);

  if (!created) return 'unavailable';

  // Stesso evento che registra il collegamento quando crea le tabelle: il
  // merchant lo ritrova nei log. Best effort — la tabella ormai c'e'.
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

  return 'created';
}

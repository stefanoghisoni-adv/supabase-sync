import type { SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { runQuery } from '~/lib/supabase-management.server';
import { buildCustomersSchemaSQL } from '~/lib/supabase-schema';
import { validateSupabaseUrl } from '~/utils/supabase-url.server';

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
export interface EnsureCustomersTableResult {
  status: 'created' | 'already_present' | 'unavailable';
  empty: boolean;
}

// Il nome che la DDL crea e' letterale (vedi buildTableSQL): possiamo provvedere
// solo a quello.
const DDL_TABLE_NAME = 'customers';

// Creare la tabella non basta: le letture e scritture passano dall'API REST del
// progetto, che tiene una copia in cache dello schema. Finche' non la ricarica
// risponde "Could not find the table ... in the schema cache" anche se la
// tabella esiste. La NOTIFY forza la ricarica.
const RELOAD_SCHEMA_SQL = "NOTIFY pgrst, 'reload schema';";

// La ricarica e' asincrona: si aspetta che la tabella diventi visibile, senza
// superare il budget di una corsa di sincronizzazione.
const VISIBILITY_ATTEMPTS = 6;
const VISIBILITY_DELAY_MS = 1000;

interface ConfigLike {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseProjectRef: string | null;
  tableNameCustomers: string;
}

type Probe =
  | { state: 'present'; empty: boolean }
  | { state: 'missing' }
  | { state: 'unknown' };

/**
 * Interroga la tabella come farebbe la sync: una sola chiamata dice se e'
 * raggiungibile e se contiene gia' qualche riga.
 *
 * La richiesta e' volutamente una lettura vera di una riga sola, non un
 * conteggio "a vuoto": su una richiesta senza corpo l'API REST risponde alla
 * tabella mancante con un 404 privo di dettagli, che il client non riconosce
 * come errore. Il risultato sarebbe una tabella inesistente riportata come
 * presente e vuota — quindi mai creata, con la sync clienti destinata a
 * fallire. Chiedendo una riga il 404 arriva con il suo codice e la tabella
 * mancante viene vista per quello che e'.
 */
async function probeTable(supabase: SupabaseClient, table: string): Promise<Probe> {
  const { data, error } = await supabase.from(table).select('shopify_customer_id').limit(1);

  if (!error) return { state: 'present', empty: (data ?? []).length === 0 };

  const code = (error as { code?: string }).code ?? '';
  const message = error.message ?? '';
  // 42P01 e' il "undefined_table" di Postgres; PGRST205 e' il modo in cui
  // l'API REST dice che la tabella non e' nella sua cache dello schema.
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(message)
  ) {
    return { state: 'missing' };
  }
  return { state: 'unknown' };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** DDL via Management API (percorso OAuth). `false` se non praticabile. */
async function createViaManagementApi(shopId: string, ref: string): Promise<boolean> {
  try {
    const token = await getValidAccessToken(shopId);
    await runQuery(token, ref, buildCustomersSchemaSQL() + RELOAD_SCHEMA_SQL);
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
      body: JSON.stringify({ query: buildCustomersSchemaSQL() + RELOAD_SCHEMA_SQL }),
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
 * Garantisce che la tabella dei clienti esista e sia raggiungibile prima di
 * sincronizzarla.
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
  const probe = await probeTable(supabase, config.tableNameCustomers);
  if (probe.state === 'present') {
    return { status: 'already_present', empty: probe.empty };
  }

  // Possiamo creare solo la tabella con il nome previsto dalla DDL: se il
  // negozio ne usa uno diverso, provvederla non e' compito nostro.
  if (config.tableNameCustomers !== DDL_TABLE_NAME) {
    console.warn(
      `[ensureCustomersTable] tabella "${config.tableNameCustomers}" non gestita dalla DDL: clienti saltati`,
    );
    return { status: 'unavailable', empty: false };
  }

  const created = config.supabaseProjectRef
    ? (await createViaManagementApi(shopId, config.supabaseProjectRef)) ||
      (await createViaExecSql(config))
    : await createViaExecSql(config);

  if (!created) return { status: 'unavailable', empty: false };

  // La tabella ora esiste nel database, ma la sync la usa attraverso l'API REST:
  // finche' quella non ha ricaricato lo schema, ogni scrittura fallirebbe. Si
  // aspetta che diventi visibile invece di scrivere subito e schiantarsi.
  for (let attempt = 0; attempt < VISIBILITY_ATTEMPTS; attempt++) {
    await wait(VISIBILITY_DELAY_MS);
    const check = await probeTable(supabase, config.tableNameCustomers);
    if (check.state === 'present') {
      await logCreation(shopId);
      return { status: 'created', empty: check.empty };
    }
  }

  // Creata ma non ancora raggiungibile: i clienti si saltano per questo giro e
  // si riprende al successivo, quando la tabella sara' visibile e vuota (quindi
  // con recupero completo). Meglio questo di una corsa fallita.
  await logCreation(shopId);
  console.warn(
    `[ensureCustomersTable] tabella clienti creata ma non ancora raggiungibile per lo shop ${shopId}`,
  );
  return { status: 'unavailable', empty: true };
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

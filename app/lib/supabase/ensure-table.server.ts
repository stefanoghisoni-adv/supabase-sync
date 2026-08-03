import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { runQuery } from '~/lib/supabase-management.server';
import { RELOAD_SCHEMA_SQL } from '~/lib/supabase-schema';
import { validateSupabaseUrl } from '~/utils/supabase-url.server';

/**
 * Nucleo condiviso per garantire che una tabella del merchant esista e sia
 * raggiungibile prima di scriverci.
 *
 * Vale per prodotti e clienti allo stesso modo: la tabella puo' mancare (piano
 * salito dopo il collegamento, progetto ricreato, DDL del collegamento non
 * andata a buon fine) oppure esserci ma non essere ancora visibile all'API REST,
 * che tiene una copia in cache dello schema. In entrambi i casi la sync
 * fallirebbe con "Could not find the table ... in the schema cache".
 */
export interface EnsureTableResult {
  status: 'created' | 'already_present' | 'unavailable';
  /** La tabella e' ancora senza righe. */
  empty: boolean;
}

// Ri-esportata dove la DDL e' definita: la ricarica dello schema serve a ogni
// modifica delle tabelle, non solo alla creazione.
export { RELOAD_SCHEMA_SQL };

// La ricarica e' asincrona: si aspetta che la tabella diventi visibile, senza
// superare il budget di una corsa di sincronizzazione.
const VISIBILITY_ATTEMPTS = 6;
const VISIBILITY_DELAY_MS = 1000;

export interface EnsureTableConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseProjectRef: string | null;
}

export interface EnsureTableSpec {
  /** Nome che la DDL crea: solo a quello possiamo provvedere. */
  ddlTableName: string;
  /** Nome configurato per questo negozio. */
  tableName: string;
  /** Colonna usata per sondare la tabella (deve esistere nella DDL). */
  probeColumn: string;
  /** DDL idempotente della tabella. */
  buildSQL: () => string;
  /** Prefisso dei messaggi di log. */
  label: string;
  /** Registra l'avvenuta creazione (best effort, a carico del chiamante). */
  onCreated?: () => Promise<void>;
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
 * presente e vuota — quindi mai creata, con la sync destinata a fallire.
 * Chiedendo una riga il 404 arriva con il suo codice e la tabella mancante
 * viene vista per quello che e'.
 */
async function probeTable(
  supabase: SupabaseClient,
  table: string,
  column: string,
): Promise<Probe> {
  const { data, error } = await supabase.from(table).select(column).limit(1);

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
async function createViaManagementApi(
  shopId: string,
  ref: string,
  spec: EnsureTableSpec,
): Promise<boolean> {
  try {
    const token = await getValidAccessToken(shopId);
    await runQuery(token, ref, spec.buildSQL() + RELOAD_SCHEMA_SQL);
    return true;
  } catch (err) {
    console.warn(
      `[${spec.label}] DDL via Management API non riuscita:`,
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
    return false;
  }
}

/** DDL via funzione `exec_sql` con la service role key (percorso legacy). */
async function createViaExecSql(
  config: EnsureTableConfig,
  spec: EnsureTableSpec,
): Promise<boolean> {
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
      body: JSON.stringify({ query: spec.buildSQL() + RELOAD_SCHEMA_SQL }),
    });
    return res.ok;
  } catch (err) {
    console.warn(
      `[${spec.label}] DDL via exec_sql non riuscita:`,
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
    return false;
  }
}

/**
 * Garantisce che la tabella esista e sia raggiungibile prima di sincronizzarla.
 *
 * La DDL e' idempotente (CREATE TABLE IF NOT EXISTS) e non distruttiva: su una
 * tabella gia' presente non tocca i dati. Se la tabella c'e' ma l'API REST non
 * la vede ancora, la ricarica dello schema viene forzata e si aspetta che
 * compaia: e' il caso di una sincronizzazione avviata subito dopo il
 * collegamento.
 */
export async function ensureTable(
  shopId: string,
  config: EnsureTableConfig,
  supabase: SupabaseClient,
  spec: EnsureTableSpec,
): Promise<EnsureTableResult> {
  const probe = await probeTable(supabase, spec.tableName, spec.probeColumn);
  if (probe.state === 'present') {
    return { status: 'already_present', empty: probe.empty };
  }

  // Possiamo creare solo la tabella con il nome previsto dalla DDL: se il
  // negozio ne usa uno diverso, provvederla non e' compito nostro.
  if (spec.tableName !== spec.ddlTableName) {
    console.warn(
      `[${spec.label}] tabella "${spec.tableName}" non gestita dalla DDL: saltata`,
    );
    return { status: 'unavailable', empty: false };
  }

  const created = config.supabaseProjectRef
    ? (await createViaManagementApi(shopId, config.supabaseProjectRef, spec)) ||
      (await createViaExecSql(config, spec))
    : await createViaExecSql(config, spec);

  if (!created) return { status: 'unavailable', empty: false };

  // La tabella ora esiste nel database, ma la sync la usa attraverso l'API REST:
  // finche' quella non ha ricaricato lo schema, ogni scrittura fallirebbe. Si
  // aspetta che diventi visibile invece di scrivere subito e schiantarsi.
  for (let attempt = 0; attempt < VISIBILITY_ATTEMPTS; attempt++) {
    await wait(VISIBILITY_DELAY_MS);
    const check = await probeTable(supabase, spec.tableName, spec.probeColumn);
    if (check.state === 'present') {
      await spec.onCreated?.();
      return { status: 'created', empty: check.empty };
    }
  }

  await spec.onCreated?.();
  console.warn(
    `[${spec.label}] tabella creata ma non ancora raggiungibile per lo shop ${shopId}`,
  );
  return { status: 'unavailable', empty: true };
}

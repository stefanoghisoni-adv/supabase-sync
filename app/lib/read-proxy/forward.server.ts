import type { ShopReadContext } from './context.server';

// products sempre; customers solo se il piano include la sync clienti.
export function allowedReadTables(customersEnabled: boolean): string[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
}

// Tabelle create e gestite dall'app: le uniche il cui accesso è vincolato al
// piano. Le altre tabelle nel progetto sono del merchant e non ci riguardano.
const MANAGED_TABLES = ['products', 'customers'];

// Nomi delle risorse embeddate in un `select` PostgREST (`select=*,customers(*)`),
// tollerando alias (`alias:customers(...)`) e hint di join (`customers!inner(...)`).
export function embeddedTableNames(search: string): string[] {
  const select = new URLSearchParams(search).get('select');
  if (!select) return [];
  const names: string[] = [];
  for (const [, name] of select.matchAll(/([a-z_][a-z0-9_]*)(?:!\w+)?\s*\(/gi)) {
    names.push(name.toLowerCase());
  }
  return names;
}

export function selectEmbedsForbiddenTable(search: string, allowed: string[]): boolean {
  return embeddedTableNames(search).some(
    (t) => MANAGED_TABLES.includes(t) && !allowed.includes(t),
  );
}

// Il consenso clienti è applicato solo al livello top del proxy: un `customers`
// embeddato aggirerebbe il gate. Vietiamo di embeddare customers, sempre.
export function selectEmbedsCustomers(search: string): boolean {
  return embeddedTableNames(search).includes('customers');
}

// Host derivato SOLO dal ref memorizzato: nessun input utente nell'host (anti-SSRF).
export function buildSupabaseReadUrl(projectRef: string, table: string, search: string): string {
  // Validazione difensiva: difende da bug futuri o usi diretti (la route filtra già table sull'allowlist).
  if (!/^[a-z_]+$/.test(table)) {
    throw new Error(`Nome tabella non valido: ${table}`);
  }
  if (!/^[a-z0-9]+$/.test(projectRef)) {
    throw new Error(`Project ref non valido: ${projectRef}`);
  }
  const qs = search && search !== '?' ? search : '';
  return `https://${projectRef}.supabase.co/rest/v1/${table}${qs}`;
}

export interface ForwardResult {
  status: number;
  body: string;
  contentType: string;
}

export async function forwardRead(
  ctx: ShopReadContext,
  table: string,
  search: string,
): Promise<ForwardResult> {
  const url = buildSupabaseReadUrl(ctx.projectRef, table, search);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: ctx.serviceRoleKey,
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
      Accept: 'application/json',
    },
  });
  const body = await res.text();
  return {
    status: res.status,
    body,
    contentType: res.headers.get('content-type') ?? 'application/json',
  };
}

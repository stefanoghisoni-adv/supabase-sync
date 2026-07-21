import type { ShopReadContext } from './context.server';

// products sempre; customers solo se il piano include la sync clienti.
export function allowedReadTables(customersEnabled: boolean): string[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
}

// Tabelle create e gestite dall'app: le uniche il cui accesso è vincolato al
// piano. Le altre tabelle nel progetto sono del merchant e non ci riguardano.
const MANAGED_TABLES = ['products', 'customers'];

// PostgREST sa restituire risorse collegate dentro un `select`
// (`?select=*,customers(*)`). L'allowlist sul path da sola non basta: senza
// questa guardia una GET su `products` potrebbe esfiltrare `customers` a uno
// shop il cui piano non li include.
//
// Cattura l'identificatore che precede una parentesi aperta, tollerando gli
// alias (`alias:customers(...)`) e gli hint di join (`customers!inner(...)`).
// Gli aggregati (`count()`, `price.sum()`) producono nomi che non sono tabelle
// gestite, quindi passano.
export function selectEmbedsForbiddenTable(search: string, allowed: string[]): boolean {
  const select = new URLSearchParams(search).get('select');
  if (!select) return false;

  const embeds = select.matchAll(/([a-z_][a-z0-9_]*)(?:!\w+)?\s*\(/gi);
  for (const [, name] of embeds) {
    const table = name.toLowerCase();
    if (MANAGED_TABLES.includes(table) && !allowed.includes(table)) return true;
  }
  return false;
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

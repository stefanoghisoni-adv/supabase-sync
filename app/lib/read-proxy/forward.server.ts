import type { ShopReadContext } from './context.server';

// products sempre; customers solo se il piano include la sync clienti.
export function allowedReadTables(customersEnabled: boolean): string[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
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

// Colonne univoche identificative: un filtro `eq` su una di queste è un "lookup
// mirato" a uno specifico cliente (es. email=eq.x).
export const IDENTIFIER_COLUMNS = ['id', 'email', 'phone', 'shopify_customer_id'];

// True se la query filtra con `eq` su una colonna identificativa.
// (URLSearchParams ignora il '?' iniziale della search.)
export function isCustomerIdentifierLookup(search: string): boolean {
  const params = new URLSearchParams(search);
  return IDENTIFIER_COLUMNS.some((col) => {
    const v = params.get(col);
    return v != null && v.startsWith('eq.');
  });
}

// Query di controllo consenso: stessi filtri, ma select=accepts_marketing.
// Rimuoviamo limit/offset così il controllo valuta l'INTERO insieme dei match:
// un limit del chiamante non deve poter nascondere una riga non consenziente
// dietro l'ordinamento (non garantito) di una consenziente.
export function consentCheckSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.set('select', 'accepts_marketing');
  params.delete('limit');
  params.delete('offset');
  return '?' + params.toString();
}

// Forza il filtro sui soli consenzienti (letture non mirate). Append di stringa
// per non ri-codificare eventuali filtri PostgREST complessi già presenti.
export function forceConsentedOnlySearch(search: string): string {
  const clean = search === '?' ? '' : search;
  const sep = clean.startsWith('?') ? '&' : '?';
  return `${clean}${sep}accepts_marketing=eq.true`;
}

// True se almeno una riga non è consenziente (false o null).
export function rowsHaveNonConsented(
  rows: Array<{ accepts_marketing?: unknown }>,
): boolean {
  return rows.some((r) => r.accepts_marketing !== true);
}

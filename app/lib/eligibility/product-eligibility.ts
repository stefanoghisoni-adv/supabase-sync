import type { SupabaseProductRow } from '~/types/shopify';

// Una riga prodotto è idonea alla sync se ha il costo del venduto valorizzato.
// cost_per_item === 0 è un costo esplicito e resta idoneo; solo null (costo mai
// impostato) rende la riga non idonea. Coerente con isVariantReady, che considera
// pronto anche "0.00".
// La seconda clausola rende vera nei dati la promessa fatta all'utente: un
// prodotto idoneo ha SEMPRE il profitto compilato. Non serve un NOT NULL sulla
// colonna, perché è questo filtro a decidere cosa viene scritto su Supabase.
export function isProductRowEligible(row: SupabaseProductRow): boolean {
  return row.cost_per_item !== null && row.net_value !== null;
}

export function filterEligibleProductRows(
  rows: SupabaseProductRow[],
): SupabaseProductRow[] {
  return rows.filter(isProductRowEligible);
}

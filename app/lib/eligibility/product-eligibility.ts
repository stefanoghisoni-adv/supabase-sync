import type { SupabaseProductRow } from '~/types/shopify';

// Una riga prodotto è idonea alla sync se ha il costo del venduto valorizzato.
// cost_per_item === 0 è un costo esplicito e resta idoneo; solo null (costo mai
// impostato) rende la riga non idonea. Coerente con isVariantReady, che considera
// pronto anche "0.00".
export function isProductRowEligible(row: SupabaseProductRow): boolean {
  return row.cost_per_item !== null;
}

export function filterEligibleProductRows(
  rows: SupabaseProductRow[],
): SupabaseProductRow[] {
  return rows.filter(isProductRowEligible);
}

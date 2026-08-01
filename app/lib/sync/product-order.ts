/**
 * Ordine con cui i prodotti vengono sincronizzati: dal piu' vecchio al piu'
 * recente, per data di creazione su Shopify.
 *
 * Non e' una preferenza estetica: quando il piano ha un tetto di prodotti, la
 * sincronizzazione si ferma appena lo raggiunge, quindi l'ordine decide *quali*
 * prodotti finiscono nel database del merchant. Partendo dai piu' vecchi il
 * contenuto resta stabile fra una corsa e l'altra — un prodotto appena creato
 * non scalza uno che c'era gia'.
 *
 * Shopify di suo restituisce le pagine per id crescente, che e' gia' l'ordine di
 * creazione; qui lo si rende esplicito, cosi' il requisito non dipende da un
 * comportamento non dichiarato dell'API.
 */
export function sortByCreatedAtAsc<T extends { id: number; created_at?: string | null }>(
  products: T[],
): T[] {
  // Copia: l'array in ingresso arriva dalla pagina appena scaricata e altrove
  // ci si aspetta di ritrovarlo com'era.
  return [...products].sort((a, b) => {
    const left = a.created_at ?? '';
    const right = b.created_at ?? '';
    // Le date ISO si confrontano bene come testo: stesso ordine del tempo, senza
    // passare da Date (e senza NaN se il formato non fosse quello atteso).
    if (left !== right) return left < right ? -1 : 1;
    // Stessa data (o data assente da entrambe le parti): decide l'id, che su
    // Shopify cresce con il tempo. Cosi' l'ordine e' comunque deterministico.
    return a.id - b.id;
  });
}

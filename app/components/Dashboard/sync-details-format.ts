// Logica di formattazione per i dettagli di sincronizzazione mostrati nel modal.

export interface DetailBadge {
  tone: 'success' | 'critical' | 'info' | 'warning';
  label: string;
}

/**
 * Restituisce il badge (tono e etichetta) per l'azione mostrata nella tabella del
 * modal.
 */
export function detailBadge(action: string): DetailBadge {
  if (action === 'added') return { tone: 'success', label: 'Aggiunto' };
  if (action === 'removed') return { tone: 'critical', label: 'Rimosso' };
  if (action === 'updated') return { tone: 'info', label: 'Aggiornato' };
  if (action === 'suspended') return { tone: 'warning', label: 'Sospeso' };
  // Fallback: non dovrebbe mai succedere, ma se arriva un'azione sconosciuta
  // meglio mostrare qualcosa di neutro che rompere il render.
  return { tone: 'info', label: action };
}

/**
 * Costruisce il riepilogo dei prodotti sincronizzati: "12 aggiunti · 3 rimossi".
 * Le voci con conteggio zero NON vengono elencate; se tutte sono a zero, stringa
 * vuota. Plurali corretti: "1 aggiunto" / "2 aggiunti".
 */
export function productSummary(added: number, removed: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? 'aggiunto' : 'aggiunti'}`);
  if (removed > 0) parts.push(`${removed} ${removed === 1 ? 'rimosso' : 'rimossi'}`);
  return parts.join(' · ');
}

/**
 * Costruisce il riepilogo dei clienti sincronizzati: "148 aggiunti · 5 aggiornati
 * · 2 sospesi". Le voci con conteggio zero NON vengono elencate; se tutte sono a
 * zero, stringa vuota. Plurali corretti: "1 aggiunto" / "2 aggiunti".
 */
export function customerSummary(added: number, updated: number, suspended: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? 'aggiunto' : 'aggiunti'}`);
  if (updated > 0) parts.push(`${updated} ${updated === 1 ? 'aggiornato' : 'aggiornati'}`);
  if (suspended > 0) parts.push(`${suspended} ${suspended === 1 ? 'sospeso' : 'sospesi'}`);
  return parts.join(' · ');
}

/**
 * Testo dell'avviso di elenco parziale: se truncated è true, restituisce il testo
 * da mostrare sotto la tabella; altrimenti null.
 */
export function truncationNotice(truncated: boolean): string | null {
  return truncated ? 'Elenco parziale: mostrate le prime 500 voci.' : null;
}

/**
 * Le tab da mostrare nel modal: sempre Prodotti, Clienti solo se customersEnabled
 * è true.
 */
export function visibleTabs(customersEnabled: boolean): ('products' | 'customers')[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
}

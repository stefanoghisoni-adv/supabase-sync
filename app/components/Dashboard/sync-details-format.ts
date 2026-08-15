import type { Dictionary } from '~/lib/i18n/context';

// Logica di formattazione per i dettagli di sincronizzazione mostrati nel modal.

export interface DetailBadge {
  tone: 'success' | 'critical' | 'info' | 'warning';
  label: string;
}

/**
 * Restituisce il badge (tono e etichetta) per l'azione mostrata nella tabella del
 * modal.
 */
export function detailBadge(action: string, t: Dictionary): DetailBadge {
  if (action === 'added') return { tone: 'success', label: t.logs.details.added };
  if (action === 'removed') return { tone: 'critical', label: t.logs.details.removed };
  if (action === 'updated') return { tone: 'info', label: t.logs.details.updated };
  if (action === 'suspended') return { tone: 'warning', label: t.logs.details.suspended };
  // Fallback: non dovrebbe mai succedere, ma se arriva un'azione sconosciuta
  // meglio mostrare qualcosa di neutro che rompere il render.
  return { tone: 'info', label: action };
}

/**
 * Costruisce il riepilogo dei prodotti sincronizzati: "12 aggiunti · 3 rimossi".
 * Le voci con conteggio zero NON vengono elencate; se tutte sono a zero, stringa
 * vuota. Plurali corretti: "1 aggiunto" / "2 aggiunti".
 */
export function productSummary(added: number, removed: number, t: Dictionary): string {
  const parts: string[] = [];
  if (added > 0) parts.push(t.logs.summaryAdded(added));
  if (removed > 0) parts.push(t.logs.summaryRemoved(removed));
  return parts.join(' · ');
}

/**
 * Costruisce il riepilogo dei clienti sincronizzati: "148 aggiunti · 5 aggiornati
 * · 2 sospesi". Le voci con conteggio zero NON vengono elencate; se tutte sono a
 * zero, stringa vuota. Plurali corretti: "1 aggiunto" / "2 aggiunti".
 */
export function customerSummary(
  added: number,
  updated: number,
  suspended: number,
  t: Dictionary,
): string {
  const parts: string[] = [];
  if (added > 0) parts.push(t.logs.summaryAdded(added));
  if (updated > 0) parts.push(t.logs.summaryUpdated(updated));
  if (suspended > 0) parts.push(t.logs.summarySuspended(suspended));
  return parts.join(' · ');
}

/**
 * Testo dell'avviso di elenco parziale: se truncated è true, restituisce il testo
 * da mostrare sotto la tabella; altrimenti null.
 */
export function truncationNotice(truncated: boolean, t: Dictionary): string | null {
  return truncated ? t.logs.partialList : null;
}

/**
 * Le tab da mostrare nel modal: sempre Prodotti, Clienti solo se customersEnabled
 * è true.
 */
export function visibleTabs(customersEnabled: boolean): ('products' | 'customers')[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
}

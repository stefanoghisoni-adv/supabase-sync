// Stato del campo "cost_per_item" nella tabella dei prodotti con problemi.
// Il costo si scrive indifferentemente con la virgola o con il punto: prima di
// confrontarlo o di salvarlo diventa sempre la stessa cosa.
export function normalizeCost(value: string): string {
  return value.trim().replace(',', '.');
}

/**
 * Il campo resta modificabile mentre il merchant lavora: i valori inseriti sono
 * appunti, non salvataggi, e vengono scritti su Shopify solo con "Ricontrolla e
 * aggiorna". Si blocca durante quell'operazione e a negozio sospeso.
 */
export function costFieldDisabled(opts: {
  updating: boolean;
  blocked: boolean;
}): boolean {
  return opts.updating || opts.blocked;
}

// Un costo da scrivere su Shopify per una variante. E' un type e non una
// interface perche' viaggia come corpo JSON della richiesta, e le interface non
// sono assegnabili al tipo "oggetto serializzabile" che si aspetta il submit.
export type PendingCost = {
  variantId: number;
  inventoryItemId: number;
  cost: string;
};

/** Una riga compilata che non si puo' salvare, con il motivo. */
export interface RejectedCost {
  variantId: number;
  reason: 'invalid' | 'no-inventory-item';
}

interface EditableRow {
  variantId: number;
  inventoryItemId: number | null;
}

/**
 * Divide i valori inseriti in "da salvare" e "da correggere". I campi lasciati
 * vuoti non sono ne' l'uno ne' l'altro: sono righe che il merchant non ha
 * ancora toccato.
 */
export function collectPendingCosts(
  rows: EditableRow[],
  values: Record<number, string>,
): { updates: PendingCost[]; rejected: RejectedCost[] } {
  const updates: PendingCost[] = [];
  const rejected: RejectedCost[] = [];

  for (const row of rows) {
    const raw = values[row.variantId];
    if (raw === undefined) continue;
    const cost = normalizeCost(raw);
    if (cost === '') continue;

    const parsed = Number(cost);
    if (!Number.isFinite(parsed) || parsed < 0) {
      rejected.push({ variantId: row.variantId, reason: 'invalid' });
      continue;
    }
    // Il costo vive sull'inventory item: senza, non c'e' dove scriverlo.
    if (!row.inventoryItemId) {
      rejected.push({ variantId: row.variantId, reason: 'no-inventory-item' });
      continue;
    }

    updates.push({ variantId: row.variantId, inventoryItemId: row.inventoryItemId, cost });
  }

  return { updates, rejected };
}

/**
 * I valori inseriti sopravvivono al cambio di tab: sono lavoro del merchant e
 * finche' non li conferma non esistono da nessun'altra parte. Se quel che era
 * stato messo da parte e' illeggibile si riparte da zero, senza far saltare la
 * pagina.
 */
export function parseStoredCosts(raw: string | null): Record<number, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const values: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const variantId = Number(key);
      if (Number.isInteger(variantId) && typeof value === 'string') {
        values[variantId] = value;
      }
    }
    return values;
  } catch {
    return {};
  }
}

// Stato del campo "cost_per_item" nella tabella dei prodotti con problemi.
// Il costo si scrive indifferentemente con la virgola o con il punto: prima di
// confrontarlo o di salvarlo diventa sempre la stessa cosa.
export function normalizeCost(value: string): string {
  return value.trim().replace(',', '.');
}

/**
 * Il campo resta modificabile anche dopo un salvataggio riuscito: un costo
 * sbagliato dev'essere correggibile subito, senza ricaricare la pagina. Si
 * blocca solo mentre una scrittura e' in volo, mentre il ricontrollo sta
 * girando (l'elenco sta per cambiare sotto le mani) e a negozio sospeso.
 */
export function costFieldDisabled(opts: {
  saving: boolean;
  rechecking: boolean;
  blocked: boolean;
}): boolean {
  return opts.saving || opts.rechecking || opts.blocked;
}

/**
 * Il tic verde dice "il valore che vedi e' salvato", non "questa riga e' stata
 * toccata": vale finche' il campo mostra esattamente cio' che e' finito su
 * Shopify. Appena il merchant lo modifica sparisce, e torna quando anche il
 * nuovo valore e' stato salvato.
 */
export function isCostSaved(savedValue: string | undefined, current: string): boolean {
  if (savedValue === undefined) return false;
  return normalizeCost(current) === savedValue;
}

/**
 * Se il salvataggio ha senso. Il campo salva quando perde il fuoco: senza
 * questo controllo basterebbe entrarci e uscirne per riscrivere su Shopify un
 * valore identico a quello gia' salvato.
 */
export function shouldSaveCost(opts: {
  value: string;
  savedValue: string | undefined;
}): boolean {
  const normalized = normalizeCost(opts.value);
  if (normalized === '') return false;
  return normalized !== opts.savedValue;
}

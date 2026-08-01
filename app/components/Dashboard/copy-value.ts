/**
 * Copia negli appunti, con ripiego.
 *
 * L'app vive dentro la cornice dell'admin: l'accesso diretto agli appunti puo'
 * essere negato e la richiesta viene rifiutata. Prima non se ne accorgeva
 * nessuno — il clic non copiava e la conferma non compariva — quindi qui il
 * rifiuto porta alla strada vecchia (selezione + comando di copia), che dentro
 * una cornice funziona ancora.
 *
 * Restituisce se la copia e' andata a buon fine: la conferma si mostra solo
 * allora, meglio nessun segnale che un "Copiato!" non vero.
 */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permesso negato: si prova l'altra strada, non e' un errore da mostrare.
  }
  return selectionCopy(value);
}

function selectionCopy(value: string): boolean {
  if (typeof document === 'undefined') return false;

  const field = document.createElement('textarea');
  field.value = value;
  // Sola lettura: su iOS altrimenti compare la tastiera. Fuori dallo schermo ma
  // non nascosto: da un elemento nascosto la selezione non si prende.
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '-9999px';
  document.body.appendChild(field);

  // La selezione che c'era prima del clic va rimessa com'era: sarebbe sgradevole
  // veder sparire il testo che si era evidenziato.
  const selection = document.getSelection();
  const previous =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(field);
  if (previous && selection) {
    selection.removeAllRanges();
    selection.addRange(previous);
  }
  return copied;
}

/**
 * Valore accorciato al centro per stare su una riga sola.
 *
 * Serve perche' i pulsanti di Polaris non mandano a capo: un valore piu' lungo
 * dello spazio disponibile uscirebbe dalla card. Si taglia in mezzo e non in
 * fondo perche' di una chiave la coda e' l'unica parte che la distingue dalle
 * altre, mentre di un indirizzo conta soprattutto l'inizio.
 *
 * Il valore intero resta quello che si copia: questa e' solo la resa a schermo.
 */
export function middleTruncate(value: string, max = 48): string {
  if (max < 5) return value;
  if (value.length <= max) return value;

  // Un carattere va al puntino di sospensione; il resto si divide fra le due
  // estremita', con l'avanzo dell'eventuale dispari dato all'inizio.
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

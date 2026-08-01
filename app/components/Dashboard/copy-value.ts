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

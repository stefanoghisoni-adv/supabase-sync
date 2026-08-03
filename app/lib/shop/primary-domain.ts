/**
 * Dominio principale del negozio: quello su cui navigano i clienti.
 *
 * Shopify lo restituisce in `shop.domain`. Finche' il merchant non ne collega
 * uno proprio coincide con il <negozio>.myshopify.com; quando lo collega — o lo
 * cambia — quel campo segue, ed e' il motivo per cui va ricontrollato invece di
 * essere letto una volta sola.
 */

/**
 * Ripulisce cio' che arriva da Shopify: puo' contenere protocollo, barra finale
 * o maiuscole a seconda di come il merchant l'ha inserito.
 * `null` se non c'e' nulla di utilizzabile.
 */
export function normalizePrimaryDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  // Un dominio ha almeno un punto e nessuno spazio: tutto il resto e' rumore.
  if (!cleaned || cleaned.includes(' ') || !cleaned.includes('.')) return null;
  return cleaned;
}

/**
 * Se il valore memorizzato va riscritto.
 *
 * Il confronto e' sul valore ripulito, cosi' una scrittura non parte per una
 * maiuscola o una barra di differenza. Un dominio che Shopify non riporta piu'
 * (null) NON cancella quello che sapevamo: meglio un valore vecchio di uno
 * perso per una risposta incompleta.
 */
export function shouldUpdatePrimaryDomain(
  stored: string | null | undefined,
  fetched: string | null | undefined,
): boolean {
  const next = normalizePrimaryDomain(fetched);
  if (next === null) return false;
  return normalizePrimaryDomain(stored) !== next;
}

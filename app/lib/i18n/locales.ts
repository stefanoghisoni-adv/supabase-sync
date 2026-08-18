/**
 * Le lingue dell'app.
 *
 * Solo le lingue: quale valuta vada con quale lingua lo decide il mercato (vedi
 * markets.ts), perche' due mercati possono parlare la stessa lingua e pagare in
 * valute diverse — inglese americano e inglese britannico.
 */

export const LOCALES = ['it', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Lingua di riserva: quella che vede chi non ha un admin in italiano.
 *
 * L'inglese e non l'italiano — un negozio tedesco o spagnolo capisce l'inglese
 * molto piu' probabilmente dell'italiano, e su Shopify e' la lingua che si
 * presume.
 */
export const FALLBACK_LOCALE: Locale = 'en';

/** Da quante voci in poi l'elenco va reso cercabile invece che a tendina. */
export const SEARCHABLE_FROM = 10;

/** Con poche voci una tendina basta; con molte serve poterle cercare. */
export function needsSearch(count: number = LOCALES.length): boolean {
  return count >= SEARCHABLE_FROM;
}

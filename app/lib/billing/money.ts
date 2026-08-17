import type { Locale } from '~/lib/i18n/locales';

/**
 * Il denaro, scritto.
 *
 * Un importo non e' mai un numero e basta: senza la valuta accanto e' una cifra
 * che ognuno legge nella propria: 29 non dice se sono euro, dollari o sterline.
 * Qui i due pezzi non si separano mai — e' l'unica difesa contro il caso in cui
 * l'app mostri un prezzo in una valuta e Shopify ne addebiti un'altra.
 */

/**
 * La valuta in cui e' scritto il listino: quella dei prezzi nella tabella
 * `plans`. Tutto il resto — i prezzi riservati, gli sconti — e' scritto in
 * questa, e un negozio con la valuta diversa la usa solo se il listino esiste
 * per intero anche nella sua.
 */
export const BASE_CURRENCY = 'EUR';

/**
 * Da lingua dell'app a convenzioni di scrittura.
 *
 * Non e' la stessa cosa: la lingua decide le parole, questa decide dove va il
 * simbolo e quale segno separa i decimali. In italiano si scrive "29,00 €", in
 * inglese "€29.00" — la stessa cifra, e in nessuna delle due l'altra forma
 * sembrerebbe scritta da chi quella lingua la parla.
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  it: 'it-IT',
  en: 'en-US',
};

function formatter(currency: string, locale: Locale, fractionDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale] ?? NUMBER_LOCALE.en, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Un prezzo di listino.
 *
 * I centesimi compaiono solo se ci sono: "29 €" e non "29,00 €", perche' i
 * prezzi dei piani sono cifre tonde e i due zeri in fondo aggiungono rumore a
 * una card che deve farsi leggere in un colpo d'occhio.
 */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  return formatter(currency, locale, Number.isInteger(amount) ? 0 : 2).format(amount);
}

/**
 * Un importo esatto: sconti e risparmi, dove i centesimi si scrivono sempre.
 *
 * "5 €" accanto a "4,10 €" farebbe sembrare il primo un'approssimazione invece
 * di una cifra precisa, e qui si sta parlando di quanto si risparmia.
 */
export function formatMoneyExact(amount: number, currency: string, locale: Locale): string {
  return formatter(currency, locale, 2).format(amount);
}

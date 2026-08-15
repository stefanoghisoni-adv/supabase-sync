/**
 * Le lingue dell'app.
 *
 * La lingua non si chiede: la si eredita dall'admin di Shopify, che gia' sa in
 * che lingua lavora il merchant. Il selettore in Impostazioni serve a chi vuole
 * un'altra cosa — e quella scelta, una volta fatta, vince sempre.
 */

export const LOCALES = ['it', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Il nome di ogni lingua nella lingua stessa.
 *
 * "English" e non "Inglese": chi cerca la propria lingua in un elenco la cerca
 * come la chiama lui, non come la chiamiamo noi.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  it: 'Italiano',
  en: 'English',
};

/**
 * Lingua di riserva: quella che vede chi non ha un admin in italiano.
 *
 * L'inglese e non l'italiano — un negozio tedesco o spagnolo capisce l'inglese
 * molto piu' probabilmente dell'italiano, e su Shopify e' la lingua che si
 * presume.
 */
export const FALLBACK_LOCALE: Locale = 'en';

/** Da quante lingue in poi l'elenco va reso cercabile invece che a tendina. */
export const SEARCHABLE_FROM = 10;

/** Con poche lingue una tendina basta; con molte serve poterle cercare. */
export function needsSearch(count: number = LOCALES.length): boolean {
  return count >= SEARCHABLE_FROM;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Da un codice di lingua qualunque alla nostra.
 *
 * Shopify manda forme come "it", "it-IT", "en-CA": conta la prima parte. Quel
 * che non conosciamo diventa la lingua di riserva, non un errore — una lingua
 * che non abbiamo non e' un guasto.
 */
export function localeFromTag(tag: string | null | undefined): Locale {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : FALLBACK_LOCALE;
}

/**
 * La lingua da usare adesso.
 *
 * La scelta del merchant vince su tutto: l'ha fatta lui, e cambiare l'admin di
 * Shopify non deve disfarla. Senza una scelta si segue l'admin, e senza
 * nemmeno quello si ripiega sulla lingua di riserva.
 */
export function resolveLocale(
  chosen: string | null | undefined,
  shopifyLocale: string | null | undefined,
): Locale {
  if (isLocale(chosen)) return chosen;
  return localeFromTag(shopifyLocale);
}

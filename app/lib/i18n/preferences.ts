import { BASE_CURRENCY } from '~/lib/billing/money';
import { FALLBACK_LOCALE, LOCALES, type Locale } from './locales';

/**
 * Lingua e valuta: due scelte, non una.
 *
 * Per un po' sono state la stessa voce ("Italiano — EUR"), e per la maggior
 * parte dei negozi va bene cosi'. Ma un negozio olandese legge in inglese e
 * paga in euro, e con una voce sola non aveva modo di dirlo. Quindi si
 * scelgono separatamente, e quello che restava vero — di solito chi legge in
 * italiano vuole gli euro — diventa il valore di partenza invece di una
 * regola.
 */

/** Il nome di ogni lingua nella lingua stessa. */
export const LOCALE_LABELS: Record<Locale, string> = {
  it: 'Italiano',
  en: 'English',
};

/** Bandiera e simbolo di ogni valuta, per l'elenco. */
export const CURRENCY_META: Record<string, { flag: string; symbol: string }> = {
  // Bandiera europea e non italiana: l'euro non e' di un paese solo, e un
  // negozio spagnolo che sceglie questa riga sta scegliendo la valuta.
  EUR: { flag: '🇪🇺', symbol: '€' },
  USD: { flag: '🇺🇸', symbol: '$' },
  GBP: { flag: '🇬🇧', symbol: '£' },
};

/** La valuta che di solito accompagna una lingua: solo un punto di partenza. */
const CURRENCY_BY_LOCALE: Record<Locale, string> = {
  it: 'EUR',
  en: BASE_CURRENCY,
};

/**
 * Quel che c'e' scritto nella colonna `locale`.
 *
 * Puo' essere una lingua ("it") oppure uno dei mercati di prima ("en-GB"), che
 * portava con se' anche la valuta: chi aveva gia' scelto non deve ritrovarsi
 * senza preferenza.
 */
export function storedPreference(value: string | null | undefined): {
  locale: Locale | null;
  currency: string | null;
} {
  const raw = (value ?? '').trim();
  if (raw === 'en-GB') return { locale: 'en', currency: 'GBP' };
  if (raw === 'en-US') return { locale: 'en', currency: 'USD' };
  return {
    locale: (LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : null,
    currency: null,
  };
}

/**
 * La lingua che Shopify ci dichiara per l'admin.
 *
 * Conta la prima parte: "it-IT" e "it" sono la stessa cosa. Quel che non
 * conosciamo diventa la lingua di riserva — una lingua che non abbiamo non e'
 * un guasto.
 */
export function localeFromTag(tag: string | null | undefined): Locale {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : FALLBACK_LOCALE;
}

export interface ShopPreferenceFields {
  /** La scelta esplicita del merchant: lingua, o un mercato di prima. */
  locale?: string | null;
  /** La valuta scelta, quando l'ha scelta. */
  preferredCurrency?: string | null;
  /** L'ultima lingua che Shopify ci ha dichiarato. */
  detectedLocale?: string | null;
}

/** In che lingua parlare a questo negozio. */
export function wantedLocale(
  shop: ShopPreferenceFields | null | undefined,
  declared?: string | null,
): Locale {
  const chosen = storedPreference(shop?.locale).locale;
  if (chosen) return chosen;
  return localeFromTag(declared ?? shop?.detectedLocale);
}

/**
 * In che valuta questo negozio si aspetta i prezzi.
 *
 * "Si aspetta", non "avra'": se il listino in quella valuta non esiste, chi
 * costruisce i prezzi ripiega sulla valuta base (vedi lib/billing/currency).
 * Qui c'e' il desiderio, li' la verifica.
 */
export function wantedCurrency(
  shop: ShopPreferenceFields | null | undefined,
  declared?: string | null,
): string {
  const explicit = (shop?.preferredCurrency ?? '').trim().toUpperCase();
  if (explicit) return explicit;

  const legacy = storedPreference(shop?.locale).currency;
  if (legacy) return legacy;

  return CURRENCY_BY_LOCALE[wantedLocale(shop, declared)] ?? BASE_CURRENCY;
}

/** Le lingue, per la colonna di sinistra. */
export function localeOptions(): { value: Locale; label: string }[] {
  return LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }));
}

/**
 * Le valute, per la colonna di destra: solo quelle che il listino ha davvero.
 *
 * Una valuta senza prezzi non si offre. Mostrarla e poi addebitare in un'altra
 * sarebbe il difetto che tutto questo codice esiste per evitare, e mostrarla
 * spenta costringerebbe a spiegare perche'.
 */
export function currencyOptions(available: string[]): { value: string; label: string }[] {
  const codes = available.includes(BASE_CURRENCY)
    ? available
    : [BASE_CURRENCY, ...available];

  return codes.map((code) => {
    const meta = CURRENCY_META[code];
    return {
      value: code,
      label: meta ? `${meta.flag}  ${code}  ${meta.symbol}` : code,
    };
  });
}

import { FALLBACK_LOCALE, type Locale } from './locales';

/**
 * Lingua e valuta insieme: quello che il merchant sceglie con un gesto solo.
 *
 * Tenerle separate sarebbe piu' ordinato per noi e piu' scomodo per lui: chi
 * legge in italiano vuole i prezzi in euro, e chiederglielo due volte in due
 * posti diversi e' una domanda in piu' su una cosa che ha gia' deciso.
 *
 * Il nome — mercato — dice che non e' solo una lingua: "English (USA)" e
 * "English (UK)" leggono lo stesso dizionario ma non pagano nella stessa
 * valuta, ed e' esattamente per questo che sono due voci.
 */
export interface Market {
  id: MarketId;
  /** La bandiera, davanti al nome. */
  flag: string;
  /** Il nome della lingua, scritto nella lingua stessa. */
  label: string;
  /** Quale dizionario legge. */
  language: Locale;
  /** In che valuta vuole vedere e pagare. */
  currency: string;
}

export const MARKET_IDS = ['it', 'en-US', 'en-GB'] as const;

export type MarketId = (typeof MARKET_IDS)[number];

export const MARKETS: Market[] = [
  // Bandiera europea e non italiana: la valuta e' l'euro, che non e' di un
  // paese solo — e un negozio spagnolo o tedesco che sceglie questa voce sta
  // scegliendo l'euro, non l'Italia.
  { id: 'it', flag: '🇪🇺', label: 'Italiano', language: 'it', currency: 'EUR' },
  { id: 'en-US', flag: '🇺🇸', label: 'English (USA)', language: 'en', currency: 'USD' },
  { id: 'en-GB', flag: '🇬🇧', label: 'English (UK)', language: 'en', currency: 'GBP' },
];

/** Il mercato di riserva: quello del listino e della scheda dell'App Store. */
export const FALLBACK_MARKET: Market = MARKETS[1];

export function isMarketId(value: unknown): value is MarketId {
  return typeof value === 'string' && (MARKET_IDS as readonly string[]).includes(value);
}

/**
 * Il mercato salvato per un negozio.
 *
 * Accetta anche le due sigle di prima — quando la scelta era la sola lingua —
 * perche' sul database ci sono ancora: 'en' diventa il mercato americano, che
 * e' quello del listino.
 */
export function marketFromId(value: string | null | undefined): Market | null {
  const id = (value ?? '').trim();
  if (isMarketId(id)) return MARKETS.find((m) => m.id === id)!;
  if (id === 'en') return FALLBACK_MARKET;
  return null;
}

/**
 * Il mercato che si deduce da come Shopify ci dichiara l'admin.
 *
 * "en-GB" e' l'unico caso in cui la seconda parte conta: sceglie fra due voci
 * che parlano la stessa lingua. Tutto il resto guarda solo la lingua.
 */
export function marketFromTag(tag: string | null | undefined): Market {
  const raw = (tag ?? '').trim().toLowerCase().replace('_', '-');
  if (raw.startsWith('en-gb')) return MARKETS.find((m) => m.id === 'en-GB')!;
  const language = raw.split('-')[0];
  const byLanguage = MARKETS.find((m) => m.language === language);
  return byLanguage ?? MARKETS.find((m) => m.language === FALLBACK_LOCALE) ?? FALLBACK_MARKET;
}

/**
 * Il mercato da usare adesso.
 *
 * La scelta del merchant vince su tutto: l'ha fatta lui, e cambiare la lingua
 * dell'admin non deve disfarla.
 */
export function resolveMarket(
  chosen: string | null | undefined,
  shopifyLocale: string | null | undefined,
): Market {
  return marketFromId(chosen) ?? marketFromTag(shopifyLocale);
}

/**
 * Come si legge una voce dell'elenco: bandiera, lingua, valuta.
 *
 * La valuta e' quella che il negozio otterrebbe DAVVERO scegliendo questa voce,
 * non quella che il mercato vorrebbe: finche' il listino in sterline non
 * esiste, "English (UK)" deve dire USD, perche' e' in dollari che verra'
 * addebitato. Un'etichetta che promette una valuta e una fattura che ne usa
 * un'altra e' il difetto che tutto questo codice esiste per evitare.
 */
export function marketLabel(market: Market, currency: string): string {
  return `${market.flag} ${market.label} — ${currency}`;
}

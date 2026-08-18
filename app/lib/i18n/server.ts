import { prisma } from '~/db.server';
import { dictionaryFor, type Dictionary } from './context';
import { type Locale } from './locales';
import { FALLBACK_MARKET, resolveMarket, type Market } from './markets';

/**
 * Il dizionario di un negozio, dal server.
 *
 * I messaggi d'errore nascono qui e finiscono in un banner: sono testo che il
 * merchant legge, quindi non possono restare nella lingua di chi ha scritto il
 * codice. La lingua e' la stessa che decide la sua interfaccia — la scelta
 * esplicita se c'e', altrimenti quella del suo admin Shopify.
 *
 * Una lettura in piu' sul percorso d'errore: e' il momento in cui una query
 * costa meno di tutto il resto, e sui percorsi che vanno a buon fine non viene
 * mai chiamata.
 */
export async function marketForShop(shopDomain: string): Promise<Market> {
  const shop = await prisma.shop
    .findUnique({
      where: { shopDomain },
      select: { locale: true, detectedLocale: true },
    })
    .catch(() => null);

  // Un guasto del database non deve trasformare un errore in un errore
  // diverso: si ripiega sul mercato di riserva e il messaggio arriva comunque.
  if (!shop) return FALLBACK_MARKET;
  return resolveMarket(shop.locale, shop.detectedLocale);
}

export async function localeForShop(shopDomain: string): Promise<Locale> {
  return (await marketForShop(shopDomain)).language;
}

export async function dictionaryForShop(shopDomain: string): Promise<Dictionary> {
  return dictionaryFor(await localeForShop(shopDomain));
}

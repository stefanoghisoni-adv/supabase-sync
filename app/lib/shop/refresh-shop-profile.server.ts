import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { normalizePrimaryDomain, shouldUpdatePrimaryDomain } from './primary-domain';

interface ShopProfile {
  id: string;
  shopDomain: string;
  accessToken: string;
  ianaTimezone: string | null;
  primaryDomain: string | null;
}

/**
 * Riallinea i dati del negozio che vivono su Shopify e che possono cambiare
 * senza che l'app ne sappia nulla: il dominio principale (il merchant puo'
 * collegarne uno proprio in qualsiasi momento) e, se manca, il fuso orario.
 *
 * Scrive solo quando c'e' davvero qualcosa di diverso: una lettura in piu' non
 * costa nulla, una scrittura inutile si', e riempirebbe il log di rumore.
 */
export async function refreshShopProfile(shop: ShopProfile): Promise<void> {
  const info = await new ShopifyAPIClient(shop.shopDomain, shop.accessToken).getShopInfo();

  const data: { ianaTimezone?: string; primaryDomain?: string } = {};

  if (!shop.ianaTimezone && info.ianaTimezone) {
    data.ianaTimezone = info.ianaTimezone;
  }
  if (shouldUpdatePrimaryDomain(shop.primaryDomain, info.primaryDomain)) {
    const next = normalizePrimaryDomain(info.primaryDomain)!;
    console.log(
      `[shop-profile] shop ${shop.id}: dominio principale ${shop.primaryDomain ?? '—'} → ${next}`,
    );
    data.primaryDomain = next;
  }

  if (Object.keys(data).length === 0) return;
  await prisma.shop.update({ where: { id: shop.id }, data });
}

// Ultimo controllo per negozio. Il dominio va ricontrollato, non letto una volta
// sola, ma non a ogni ricarica della pagina: cambia una volta ogni tanto, e ogni
// controllo e' una chiamata a Shopify sul percorso di apertura dell'app. Vive in
// memoria: al massimo si ricontrolla prima del previsto quando l'istanza cambia.
const lastCheck = new Map<string, number>();
const CHECK_EVERY_MS = 60 * 60_000;

/**
 * Controllo in sottofondo, all'apertura dell'app: non si attende, cosi' la
 * dashboard non paga la chiamata a Shopify. Se fallisce si riprova all'apertura
 * successiva.
 */
export function triggerShopProfileRefresh(shop: ShopProfile): void {
  const now = Date.now();
  const previous = lastCheck.get(shop.id);
  if (previous != null && now - previous < CHECK_EVERY_MS) return;
  lastCheck.set(shop.id, now);

  void refreshShopProfile(shop).catch((err) => {
    console.warn(
      '[shop-profile] controllo del profilo negozio fallito:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
  });
}

/** Solo per i test: azzera la memoria dei controlli. */
export function clearShopProfileChecks(): void {
  lastCheck.clear();
}

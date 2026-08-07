import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import {
  detectTrackingChannels,
  detectThemeTracking,
  themeFilesToInspect,
  type TrackingFinding,
} from '~/lib/tracking/detect';

/**
 * Che cosa sta gia' inviando eventi su questo negozio.
 *
 * Best effort su entrambi i fronti: se una delle due letture fallisce si
 * restituisce quello che si e' potuto vedere, invece di non dire niente. Il
 * risultato e' comunque un elenco parziale per costruzione — i pixel
 * personalizzati non sono leggibili da nessuna app — e l'interfaccia lo dichiara.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    return json({ findings: [] as TrackingFinding[], partial: true });
  }

  const client = await ShopifyAPIClient.forShop(shop.shopDomain);
  const findings: TrackingFinding[] = [];
  let partial = false;

  try {
    findings.push(...detectTrackingChannels(await client.getPublications()));
  } catch (err) {
    partial = true;
    console.warn(
      '[api.tracking.conflicts] canali non leggibili:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
  }

  try {
    // Prima i nomi, poi il contenuto dei soli file che interessano: chiedere il
    // corpo dell'intero tema costerebbe molto e servirebbe a niente.
    const wanted = themeFilesToInspect(await client.listThemeFilenames());
    if (wanted.length > 0) {
      findings.push(...detectThemeTracking(await client.getThemeFiles(wanted)));
    }
  } catch (err) {
    partial = true;
    console.warn(
      '[api.tracking.conflicts] tema non leggibile:',
      err instanceof Error ? err.message : 'errore sconosciuto',
    );
  }

  return json({ findings, partial });
}

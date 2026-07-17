import type { ShopifyProduct } from '~/types/shopify';
import { isVariantReady } from './product-readiness';

// Shopify limita a 100 gli id per chiamata a inventory_items.json.
const BATCH = 100;

// Client minimo richiesto: solo il metodo che ci serve (facilita i test).
interface InventoryReader {
  getInventoryItems(ids: number[]): Promise<{ id: number; cost: string | null }[]>;
}

/**
 * Popola `variant.cost` leggendo il costo reale dagli InventoryItem: products.json
 * NON restituisce il cost_per_item sulla variante. Muta e ritorna i prodotti così
 * che readiness e collectProblemVariants (che leggono variant.cost) siano accurati.
 */
export async function enrichVariantCosts(
  client: InventoryReader,
  products: ShopifyProduct[],
): Promise<ShopifyProduct[]> {
  const ids: number[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      if (v.inventory_item_id) ids.push(v.inventory_item_id);
    }
  }
  if (ids.length === 0) return products;

  const costById = new Map<number, string | null>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const items = await client.getInventoryItems(chunk);
    for (const it of items) costById.set(it.id, it.cost);
  }

  for (const p of products) {
    for (const v of p.variants) {
      if (v.inventory_item_id && costById.has(v.inventory_item_id)) {
        v.cost = costById.get(v.inventory_item_id) ?? null;
      }
    }
  }
  return products;
}

/**
 * Re-check mirato: dati gli inventory item id delle varianti che erano
 * problematiche, ritorna quelli a cui MANCA ANCORA il cost_per_item. Serve al
 * pulsante "Ricontrolla" per rimuovere dalla tabella le varianti risolte.
 */
export async function getMissingCostInventoryIds(
  client: InventoryReader,
  ids: number[],
): Promise<number[]> {
  if (ids.length === 0) return [];
  const missing: number[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const items = await client.getInventoryItems(chunk);
    for (const it of items) {
      if (!isVariantReady(it.cost)) missing.push(it.id);
    }
  }
  return missing;
}

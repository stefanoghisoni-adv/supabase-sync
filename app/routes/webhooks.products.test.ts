import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/webhooks/verify.server', () => ({ verifyWebhook: () => true }));
vi.mock('~/lib/transformers/product.server', () => ({ transformProduct: vi.fn() }));
vi.mock('~/lib/supabase.server', () => ({ createSupabaseClient: vi.fn() }));
vi.mock('~/lib/shopify-api.server', () => ({ ShopifyAPIClient: vi.fn() }));
vi.mock('~/lib/stats/inventory-cost.server', () => ({
  enrichVariantCosts: vi.fn(async (_c: unknown, p: unknown) => p),
}));
vi.mock('~/db.server', () => ({
  prisma: { shop: { findUnique: vi.fn() }, syncJob: { create: vi.fn() } },
}));

import { action } from './webhooks.products.create';
import { transformProduct } from '~/lib/transformers/product.server';
import { createSupabaseClient } from '~/lib/supabase.server';
import { enrichVariantCosts } from '~/lib/stats/inventory-cost.server';
import { prisma } from '~/db.server';

function req(body: object) {
  return new Request('https://app/webhooks/products/create', {
    method: 'POST',
    headers: {
      'X-Shopify-Hmac-Sha256': 'sig',
      'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
    },
    body: JSON.stringify(body),
  });
}

describe('webhook products/create — idoneità', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('arricchisce il costo e upserta solo le varianti idonee', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'enc',
      supabaseConfig: { syncEnabled: true, tableNameProducts: 'products' },
    });
    (prisma.syncJob.create as any).mockResolvedValue({});
    const upserted: any[] = [];
    (createSupabaseClient as any).mockReturnValue({
      from: () => ({
        upsert: async (rows: any[]) => { upserted.push(...rows); return { error: null }; },
        delete: () => ({ eq: () => ({ not: async () => ({ error: null }), is: async () => ({ error: null }) }) }),
      }),
    });
    (transformProduct as any).mockReturnValue([
      { shopify_product_id: 1, shopify_variant_id: 11, cost_per_item: 5 },
      { shopify_product_id: 1, shopify_variant_id: 12, cost_per_item: null },
    ]);

    const res = await action({ request: req({ id: 1, variants: [{ id: 11 }, { id: 12 }] }) } as any);

    expect(enrichVariantCosts).toHaveBeenCalledTimes(1);
    expect(upserted.map((r) => r.shopify_variant_id)).toEqual([11]);
    expect(res.status).toBe(200);
  });

  it('nessuna variante idonea → rimuove tutte le righe del prodotto', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'enc',
      supabaseConfig: { syncEnabled: true, tableNameProducts: 'products' },
    });
    (prisma.syncJob.create as any).mockResolvedValue({});
    let deletedAllForProduct: number | null = null;
    (createSupabaseClient as any).mockReturnValue({
      from: () => ({
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async (_c: string, id: number) => { deletedAllForProduct = id; return { error: null }; } }),
      }),
    });
    (transformProduct as any).mockReturnValue([
      { shopify_product_id: 7, shopify_variant_id: 71, cost_per_item: null },
    ]);

    await action({ request: req({ id: 7, variants: [{ id: 71 }] }) } as any);
    expect(deletedAllForProduct).toBe(7);
  });
});

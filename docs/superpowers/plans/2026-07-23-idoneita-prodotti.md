# Idoneità prodotti nella sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizzare su Supabase solo le varianti prodotto idonee (con `cost_per_item` valorizzato), su tutti i percorsi di scrittura, rimuovendo i residui non idonei.

**Architecture:** Un modulo puro di idoneità (`isProductRowEligible` / `filterEligibleProductRows`) viene applicato prima di ogni upsert nei tre percorsi di scrittura prodotti: bulk/manuale, periodica, webhook. Il backfill è automatico grazie al pre-clear del bulk. Il webhook arricchisce il costo dall'InventoryItem prima di filtrare.

**Tech Stack:** Remix 2, TypeScript, Prisma, Supabase JS, Vitest.

## Global Constraints

- Idoneo = `row.cost_per_item !== null` (un costo `0` è idoneo; solo `null` non lo è).
- Il filtro opera sulla riga trasformata `SupabaseProductRow`, non sul prodotto Shopify.
- `cost_per_item` vive sull'InventoryItem: ogni percorso che filtra per costo deve prima chiamare `enrichVariantCosts`.
- Il tetto per piano (`maxProducts`) si applica DOPO il filtro: un prodotto consuma quota solo se ha ≥1 variante idonea.
- TDD: test che fallisce prima, poi implementazione. `npm test` e `npm run build` verdi a fine di ogni task.
- Messaggi/commenti in italiano, coerenti col codice esistente.

---

### Task 1: Modulo centrale di idoneità

**Files:**
- Create: `app/lib/eligibility/product-eligibility.ts`
- Test: `app/lib/eligibility/product-eligibility.test.ts`

**Interfaces:**
- Produces:
  - `isProductRowEligible(row: SupabaseProductRow): boolean`
  - `filterEligibleProductRows(rows: SupabaseProductRow[]): SupabaseProductRow[]`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/eligibility/product-eligibility.test.ts
import { describe, it, expect } from 'vitest';
import {
  isProductRowEligible,
  filterEligibleProductRows,
} from './product-eligibility';
import type { SupabaseProductRow } from '~/types/shopify';

// Solo cost_per_item conta per l'idoneità: le altre colonne non servono al test.
const row = (cost: number | null, variantId: number): SupabaseProductRow =>
  ({ shopify_variant_id: variantId, cost_per_item: cost } as unknown as SupabaseProductRow);

describe('product-eligibility', () => {
  it('cost_per_item null → non idoneo', () => {
    expect(isProductRowEligible(row(null, 1))).toBe(false);
  });

  it('cost_per_item 0 → idoneo (costo esplicito)', () => {
    expect(isProductRowEligible(row(0, 1))).toBe(true);
  });

  it('cost_per_item positivo → idoneo', () => {
    expect(isProductRowEligible(row(12.5, 1))).toBe(true);
  });

  it('filterEligibleProductRows tiene solo le righe con costo', () => {
    const rows = [row(10, 1), row(null, 2), row(0, 3), row(null, 4)];
    const kept = filterEligibleProductRows(rows);
    expect(kept.map((r) => r.shopify_variant_id)).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/lib/eligibility/product-eligibility.test.ts`
Expected: FAIL — modulo `./product-eligibility` non trovato.

- [ ] **Step 3: Implementa il modulo**

```ts
// app/lib/eligibility/product-eligibility.ts
import type { SupabaseProductRow } from '~/types/shopify';

// Una riga prodotto è idonea alla sync se ha il costo del venduto valorizzato.
// cost_per_item === 0 è un costo esplicito e resta idoneo; solo null (costo mai
// impostato) rende la riga non idonea. Coerente con isVariantReady, che considera
// pronto anche "0.00".
export function isProductRowEligible(row: SupabaseProductRow): boolean {
  return row.cost_per_item !== null;
}

export function filterEligibleProductRows(
  rows: SupabaseProductRow[],
): SupabaseProductRow[] {
  return rows.filter(isProductRowEligible);
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run app/lib/eligibility/product-eligibility.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/eligibility/product-eligibility.ts app/lib/eligibility/product-eligibility.test.ts
git commit -m "feat: modulo idoneità righe prodotto (cost_per_item)"
```

---

### Task 2: Filtro idoneità nel bulk sync + tetto per piano

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (import + funzione `processInitialBulkSync`, ~riga 380-391 e ~428-429)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Consumes: `filterEligibleProductRows` (Task 1).
- Produces: comportamento — `processInitialBulkSync` upserta solo righe idonee; i prodotti senza varianti idonee non consumano `maxProducts`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `app/lib/workers/bulk-sync.test.ts`. Se in cima al file NON è già mockato `../stats/inventory-cost.server`, aggiungi questo mock accanto agli altri `vi.mock` (evita che il costo reale venga letto via API nei test):

```ts
vi.mock('../stats/inventory-cost.server', () => ({
  enrichVariantCosts: vi.fn(async (_client: unknown, products: unknown) => products),
}));
```

Poi aggiungi il caso di test (usa il pattern di mock già presente nel file per shop/plan/supabase; qui l'estratto rilevante):

```ts
it('upserta solo le varianti idonee e non conta i prodotti senza costo verso il tetto', async () => {
  const mockShop = {
    id: 'shop-1',
    shopDomain: 'test-shop.myshopify.com',
    accessToken: 'encrypted-token',
    authorization: 'ENABLED',
    currentPlan: 'free',
    supabaseConfig: {
      syncEnabled: true,
      tableNameProducts: 'products',
      tableNameCustomers: 'customers',
      supabaseUrl: 'https://test.supabase.co',
      supabasePublicKey: 'k',
      supabaseServiceRoleKey: 's',
    },
  };
  (prisma.shop.findUnique as any).mockResolvedValue(mockShop);
  (prisma.plan.findUnique as any).mockResolvedValue({ maxProducts: null, customersSyncEnabled: false });
  (prisma.syncJob.create as any).mockResolvedValue({ id: 'job-1' });
  (prisma.syncJob.update as any).mockResolvedValue({});

  // Pagina 1: due prodotti. Prodotto A con una variante idonea e una no;
  // prodotto B senza varianti idonee.
  const upserted: any[] = [];
  const supabaseMock = {
    from: () => ({
      delete: () => ({ gte: async () => ({ error: null }) }),
      upsert: async (rows: any[]) => { upserted.push(...rows); return { error: null }; },
    }),
  };
  (createSupabaseClient as any).mockReturnValue(supabaseMock);
  (ShopifyAPIClient as any).mockImplementation(() => ({
    getProducts: vi
      .fn()
      .mockResolvedValueOnce({ products: [{ id: 1 }, { id: 2 }], nextPageInfo: null })
      .mockResolvedValue({ products: [], nextPageInfo: null }),
  }));
  (transformProduct as any).mockImplementation((p: any) =>
    p.id === 1
      ? [
          { shopify_product_id: 1, shopify_variant_id: 11, cost_per_item: 5 },
          { shopify_product_id: 1, shopify_variant_id: 12, cost_per_item: null },
        ]
      : [{ shopify_product_id: 2, shopify_variant_id: 21, cost_per_item: null }],
  );

  const job = { updateProgress: vi.fn() } as any;
  await processInitialBulkSync('shop-1', job);

  // Solo la variante 11 (idonea) è stata upsertata.
  expect(upserted.map((r) => r.shopify_variant_id)).toEqual([11]);
  // Il progresso registra 1 prodotto (A) e 1 variante: B, senza varianti idonee,
  // non consuma quota. (updateProgress riceve i totali della pagina.)
  expect(job.updateProgress).toHaveBeenCalledWith({ products: 1, variants: 1 });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "solo le varianti idonee"`
Expected: FAIL — vengono upsertate anche le righe con `cost_per_item: null` e `productsSynced` è 2.

- [ ] **Step 3: Implementa il filtro nel bulk**

In `app/lib/workers/processors.server.ts`, aggiorna l'import da `../limits/product-limit` togliendo `limitProducts` (non più usato nel bulk) e aggiungi l'import del modulo idoneità:

```ts
import { isProductLimitReached } from '../limits/product-limit';
import { filterEligibleProductRows } from '../eligibility/product-eligibility';
```

Sostituisci il blocco che oggi è (dentro `processInitialBulkSync`, ~riga 380-391):

```ts
      // Tetto del piano: processa al massimo `maxProducts` prodotti totali.
      // I prodotti oltre il limite non vengono sincronizzati (upgrade richiesto).
      const pageProducts = limitProducts<ShopifyProduct>(products, totalProducts, maxProducts);

      // Transform products to Supabase rows
      const allRows = [];
      for (const product of pageProducts) {
        const rows = transformProduct(product);
        allRows.push(...rows);
        totalProducts++;
        totalVariants += rows.length;
      }
```

con:

```ts
      // Trasforma, filtra le idonee e applica il tetto DOPO il filtro: un prodotto
      // consuma quota solo se ha ≥1 variante idonea.
      const allRows = [];
      for (const product of products) {
        if (maxProducts != null && totalProducts >= maxProducts) break;
        const eligibleRows = filterEligibleProductRows(transformProduct(product));
        if (eligibleRows.length === 0) continue; // nessuna variante idonea: niente quota
        allRows.push(...eligibleRows);
        totalProducts++;
        totalVariants += eligibleRows.length;
      }
```

(Il blocco `if (isProductLimitReached(totalProducts, maxProducts)) break;` a fine ciclo resta invariato e interrompe la paginazione una volta saturo il tetto.)

- [ ] **Step 4: Esegui i test del bulk e verifica che passino**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts`
Expected: PASS (nuovo test + quelli esistenti).

- [ ] **Step 5: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "feat: bulk sync scrive solo varianti idonee e conta la quota sugli idonei"
```

---

### Task 3: Filtro idoneità nella sync periodica + rimozione varianti diventate non idonee

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (funzione `processPeriodicSyncCheck`, ~riga 196-257)
- Test: `app/lib/workers/periodic-sync.test.ts`

**Interfaces:**
- Consumes: `filterEligibleProductRows` (Task 1, già importato in Task 2).
- Produces: comportamento — la periodica upserta solo righe idonee; una variante che perde il costo viene cancellata come orfana; un prodotto interamente non idoneo ha le sue righe rimosse e non consuma quota.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `app/lib/workers/periodic-sync.test.ts` (riusa lo stile di mock già presente; assicurati che `../stats/inventory-cost.server` sia mockato come nel Task 2). Estratto rilevante:

```ts
it('cancella la variante che perde il costo e upserta solo le idonee', async () => {
  const mockShop = {
    id: 'shop-1',
    shopDomain: 'test-shop.myshopify.com',
    accessToken: 'encrypted-token',
    authorization: 'ENABLED',
    currentPlan: 'free',
    supabaseConfig: {
      syncEnabled: true,
      tableNameProducts: 'products',
      updatedAt: new Date('2026-07-01T00:00:00Z'),
    },
  };
  (prisma.shop.findUnique as any).mockResolvedValue(mockShop);
  (prisma.plan.findUnique as any).mockResolvedValue({ maxProducts: null, customersSyncEnabled: false });
  (prisma.syncJob.findFirst as any).mockResolvedValue(null);
  (prisma.syncJob.create as any).mockResolvedValue({ id: 'job-1' });
  (prisma.syncJob.update as any).mockResolvedValue({});

  const deletedInIds: any[] = [];
  const upserted: any[] = [];
  const supabaseMock = {
    from: () => ({
      // riga esistente: variante 11 (che ora perde il costo)
      select: () => ({ eq: async () => ({ data: [{ shopify_variant_id: 11 }] }) }),
      delete: () => ({
        eq: () => ({
          in: async (_col: string, ids: any[]) => { deletedInIds.push(...ids); return { error: null }; },
          is: async () => ({ error: null }),
        }),
      }),
      upsert: async (rows: any[]) => { upserted.push(...rows); return { error: null }; },
    }),
  };
  (createSupabaseClient as any).mockReturnValue(supabaseMock);
  (ShopifyAPIClient as any).mockImplementation(() => ({
    getProducts: vi
      .fn()
      .mockResolvedValueOnce({ products: [{ id: 1 }], nextPageInfo: null })
      .mockResolvedValue({ products: [], nextPageInfo: null }),
  }));
  // Il prodotto ora ha variante 11 senza costo e 12 con costo.
  (transformProduct as any).mockReturnValue([
    { shopify_product_id: 1, shopify_variant_id: 11, cost_per_item: null },
    { shopify_product_id: 1, shopify_variant_id: 12, cost_per_item: 8 },
  ]);

  await processPeriodicSyncCheck('shop-1');

  // La 11 (persa idoneità) viene cancellata come orfana; solo la 12 è upsertata.
  expect(deletedInIds).toContain(11);
  expect(upserted.map((r) => r.shopify_variant_id)).toEqual([12]);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/lib/workers/periodic-sync.test.ts -t "perde il costo"`
Expected: FAIL — la 11 non viene cancellata (è in `currentVariantIds`) e viene upsertata.

- [ ] **Step 3: Implementa il filtro nella periodica**

In `processPeriodicSyncCheck`, sostituisci il blocco che oggi è (~riga 196-201):

```ts
        // Righe correnti: ogni riga ha un shopify_variant_id reale (anche i
        // prodotti a variante singola).
        const currentRows = transformProduct(product);
        const currentVariantIds = new Set(
          currentRows.map(r => r.shopify_variant_id).filter((id): id is number => id != null)
        );
```

con:

```ts
        // Solo righe idonee: le varianti senza costo non vanno scritte e, se
        // presenti da prima, devono risultare "orfane" e quindi cancellate.
        const eligibleRows = filterEligibleProductRows(transformProduct(product));
        const currentVariantIds = new Set(
          eligibleRows.map(r => r.shopify_variant_id).filter((id): id is number => id != null)
        );
```

Poi sostituisci il blocco di upsert + conteggi che oggi è (~riga 241-257):

```ts
        // Upsert di tutte le righe correnti con la chiave univoca.
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(currentRows, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Periodic sync upsert error for product ${product.id}:`, error);
          continue;
        }

        totalProducts++;
        totalVariants += currentRows.length;
        // Aggiorna il conteggio prodotti distinti (no-op se già presente).
        if (existingProductIds != null) existingProductIds.add(product.id);
```

con:

```ts
        // Se non resta alcuna variante idonea, la riconciliazione sopra ha già
        // rimosso le righe del prodotto: non si upserta e non si consuma quota.
        if (eligibleRows.length === 0) continue;

        // Upsert delle sole righe idonee con la chiave univoca.
        const { error } = await supabase
          .from(shop.supabaseConfig.tableNameProducts)
          .upsert(eligibleRows, {
            onConflict: 'shopify_variant_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Periodic sync upsert error for product ${product.id}:`, error);
          continue;
        }

        totalProducts++;
        totalVariants += eligibleRows.length;
        // Aggiorna il conteggio prodotti distinti (no-op se già presente).
        if (existingProductIds != null) existingProductIds.add(product.id);
```

- [ ] **Step 4: Esegui i test della periodica e verifica che passino**

Run: `npx vitest run app/lib/workers/periodic-sync.test.ts`
Expected: PASS (nuovo test + esistenti).

- [ ] **Step 5: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/periodic-sync.test.ts
git commit -m "feat: sync periodica scrive solo idonee e rimuove le varianti che perdono il costo"
```

---

### Task 4: Webhook prodotto — arricchimento costo + filtro idoneità

**Files:**
- Modify: `app/routes/webhooks.products.create.tsx`
- Test: `app/routes/webhooks.products.test.ts` (create)

**Interfaces:**
- Consumes: `filterEligibleProductRows` (Task 1), `enrichVariantCosts` (`app/lib/stats/inventory-cost.server`), `ShopifyAPIClient` (`app/lib/shopify-api.server`).
- Produces: comportamento — il webhook arricchisce il costo, upserta solo idonee; se nessuna riga è idonea rimuove tutte le righe del prodotto.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/routes/webhooks.products.test.ts
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
  beforeEach(() => vi.clearAllMocks());

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
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/routes/webhooks.products.test.ts`
Expected: FAIL — `enrichVariantCosts` non è chiamato e viene upsertata anche la variante con `cost_per_item: null`.

- [ ] **Step 3: Implementa arricchimento + filtro nel webhook**

In `app/routes/webhooks.products.create.tsx` aggiungi gli import:

```ts
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { enrichVariantCosts } from '~/lib/stats/inventory-cost.server';
import { filterEligibleProductRows } from '~/lib/eligibility/product-eligibility';
```

Sostituisci il blocco che oggi va da `// Transform product to Supabase rows` fino alla fine della riconciliazione legacy (righe ~48-103), con:

```ts
    // Il cost_per_item vive sull'InventoryItem e NON è nel payload del webhook:
    // arricchiamo il costo prima di trasformare, altrimenti ogni update scriverebbe
    // cost_per_item null (variante non idonea → rimossa).
    const shopifyClient = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);
    await enrichVariantCosts(shopifyClient, [product]);

    // Solo righe idonee (con costo).
    const rows = filterEligibleProductRows(transformProduct(product));

    // Create Supabase client
    const supabase = createSupabaseClient(shop.supabaseConfig);
    const tableName = shop.supabaseConfig.tableNameProducts;

    if (rows.length === 0) {
      // Nessuna variante idonea: rimuovi tutte le righe del prodotto (potrebbe
      // aver perso il costo su tutte le varianti).
      const { error: delAllError } = await supabase
        .from(tableName)
        .delete()
        .eq('shopify_product_id', product.id);
      if (delAllError) {
        console.warn('Could not remove rows for now-ineligible product:', delAllError);
      }
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'webhook',
          status: 'completed',
          productsSynced: 0,
          variantsSynced: 0,
          completedAt: new Date(),
        },
      });
      return json({ ok: true }, { status: 200 });
    }

    // Upsert delle sole righe idonee con la chiave univoca.
    const { error } = await supabase
      .from(tableName)
      .upsert(rows, {
        onConflict: 'shopify_variant_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Supabase products upsert error:', error);
      await prisma.syncJob.create({
        data: {
          shopId: shop.id,
          jobType: 'webhook',
          status: 'failed',
          productsSynced: 0,
          variantsSynced: 0,
          errors: { message: error.message, code: error.code },
        },
      });
      return json({ ok: true }, { status: 200 });
    }

    // Riconcilia: elimina le righe del prodotto il cui variant_id non è più tra
    // le idonee correnti (varianti rimosse, transizione multi→single, o varianti
    // che hanno perso il costo).
    const currentVariantIds = rows.map(r => r.shopify_variant_id).filter(Boolean);
    if (currentVariantIds.length > 0) {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('shopify_product_id', product.id)
        .not('shopify_variant_id', 'in', `(${currentVariantIds.map(id => `'${id}'`).join(',')})`);

      if (deleteError) {
        console.warn('Could not clean stale variants:', deleteError);
      }
    }

    // Righe legacy con variant_id NULL (create prima dell'id reale): rimuovile.
    const { error: legacyDeleteError } = await supabase
      .from(tableName)
      .delete()
      .eq('shopify_product_id', product.id)
      .is('shopify_variant_id', null);

    if (legacyDeleteError) {
      console.warn('Could not clean legacy null-variant row:', legacyDeleteError);
    }
```

(Il blocco successivo che logga il sync riuscito e ritorna `{ ok: true }` resta invariato.)

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run app/routes/webhooks.products.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Verifica build (la route webhook è compilata)**

Run: `npm run build`
Expected: build client e server verdi (il file `webhooks.products.test.ts` è escluso dalle route via `ignoredRouteFiles`).

- [ ] **Step 6: Commit**

```bash
git add app/routes/webhooks.products.create.tsx app/routes/webhooks.products.test.ts
git commit -m "feat: webhook prodotto arricchisce il costo e scrive solo varianti idonee"
```

---

### Task 5: Verifica finale end-to-end

**Files:** nessuna modifica.

- [ ] **Step 1: Suite completa verde**

Run: `npm test`
Expected: tutti i test passano (i ~160 esistenti + i nuovi).

- [ ] **Step 2: Build verde**

Run: `npm run build`
Expected: build client e server senza errori.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (in particolare nessun import inutilizzato di `limitProducts`).

---

## Note di verifica manuale (post-deploy, facoltativa)

Su uno store con residui non idonei: lanciare un **sync manuale** dalla Dashboard e
verificare che la tabella `products` contenga solo righe con `cost_per_item`
valorizzato (query diretta o via proxy).

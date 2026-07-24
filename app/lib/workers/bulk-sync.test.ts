import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock all dependencies BEFORE imports (using factory functions)
vi.mock('../../db.server', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../utils/crypto.server', () => ({
  decrypt: (val: string) => `decrypted_${val}`,
}));

vi.mock('../shopify-api.server', () => ({
  ShopifyAPIClient: vi.fn(),
}));

vi.mock('../supabase.server', () => ({
  createSupabaseClient: vi.fn(),
}));

vi.mock('../transformers/product.server', () => ({
  transformProduct: vi.fn(),
}));

vi.mock('../stats/inventory-cost.server', () => ({
  enrichVariantCosts: vi.fn(async (_client: unknown, products: unknown) => products),
}));

// Import after mocks
import { processInitialBulkSync } from './processors.server';
import { ShopifyAPIClient } from '../shopify-api.server';
import { createSupabaseClient } from '../supabase.server';
import { transformProduct } from '../transformers/product.server';
import { prisma } from '../../db.server';

describe('Initial bulk sync processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync all products with pagination and separated upserts', async () => {
    // Mock shop with config
    const mockShop = {
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    // Mock SyncJob create
    const mockSyncJob = { id: 'sync-job-1' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Mock Shopify API client - 2 pages of products
    const mockProducts1 = [
      { id: 1, title: 'Product 1', variants: [{ id: 101, title: 'Variant 1' }, { id: 102, title: 'Variant 2' }] },
      { id: 2, title: 'Product 2', variants: [{ id: 201, title: 'Default Title' }] },
    ];
    const mockProducts2 = [
      { id: 3, title: 'Product 3', variants: [{ id: 301, title: 'Variant A' }, { id: 302, title: 'Variant B' }] },
    ];

    let getProductsCallCount = 0;
    const mockGetProducts = vi.fn().mockImplementation(async (options) => {
      getProductsCallCount++;
      if (getProductsCallCount === 1) {
        return { products: mockProducts1, nextPageInfo: 'page-2-token' };
      }
      if (getProductsCallCount === 2) {
        return { products: mockProducts2, nextPageInfo: null };
      }
      return { products: [], nextPageInfo: null };
    });

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: mockGetProducts,
    } as any));

    // Mock transformProduct to return rows with is_variant flag
    vi.mocked(transformProduct)
      .mockReturnValueOnce([
        { shopify_product_id: 1, shopify_variant_id: 101, is_variant: true } as any,
        { shopify_product_id: 1, shopify_variant_id: 102, is_variant: true } as any,
      ])
      .mockReturnValueOnce([
        { shopify_product_id: 2, shopify_variant_id: null, is_variant: false } as any,
      ])
      .mockReturnValueOnce([
        { shopify_product_id: 3, shopify_variant_id: 301, is_variant: true } as any,
        { shopify_product_id: 3, shopify_variant_id: 302, is_variant: true } as any,
      ]);

    // Mock Supabase client
    const mockUpsert = vi.fn().mockReturnValue({
      error: null,
    });

    // Il clear dei prodotti prima del ripopolamento: .delete().gte(...) → { error: null }
    const mockGte = vi.fn().mockReturnValue({ error: null });
    const mockLt = vi.fn().mockReturnValue({ error: null });
    const mockDelete = vi.fn().mockReturnValue({ gte: mockGte, lt: mockLt });
    const mockFrom = vi.fn().mockReturnValue({
      upsert: mockUpsert,
      delete: mockDelete,
    });

    vi.mocked(createSupabaseClient).mockReturnValue({
      from: mockFrom,
    } as any);

    // Mock BullMQ job
    const mockJob = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job;

    // Execute bulk sync
    await processInitialBulkSync('shop-1', mockJob);

    // Verify shop was loaded with config
    expect(prisma.shop.findUnique).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      include: { supabaseConfig: true },
    });

    // Verify SyncJob was created as 'running'
    expect(prisma.syncJob.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop-1',
        jobType: 'initial_bulk',
        status: 'running',
      },
    });

    // Verify pagination: getProducts called twice (page 1, page 2)
    expect(getProductsCallCount).toBe(2);

    // Verify transformProduct called for each product (3 products total)
    expect(transformProduct).toHaveBeenCalledTimes(3);

    // Verify products upsert usa SEMPRE la chiave univoca shopify_variant_id
    // (anche i prodotti a variante singola ora hanno un id reale).
    expect(mockUpsert).toHaveBeenCalled();

    const productUpsertCalls = mockUpsert.mock.calls.filter(
      call => call[1]?.onConflict === 'shopify_variant_id'
    );
    expect(productUpsertCalls.length).toBeGreaterThan(0);

    // Nessun upsert deve più usare shopify_product_id (non ha vincolo UNIQUE).
    const nonVariantUpsertCalls = mockUpsert.mock.calls.filter(
      call => call[1]?.onConflict === 'shopify_product_id'
    );
    expect(nonVariantUpsertCalls.length).toBe(0);

    // Verify job progress was updated
    expect(mockJob.updateProgress).toHaveBeenCalled();

    // Verify SyncJob progress updates
    expect(prisma.syncJob.update).toHaveBeenCalledWith({
      where: { id: 'sync-job-1' },
      data: expect.objectContaining({
        productsSynced: expect.any(Number),
        variantsSynced: expect.any(Number),
      }),
    });

    // Verify SyncJob was marked as completed
    const completedCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.status === 'completed'
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.[0].data).toMatchObject({
      status: 'completed',
      completedAt: expect.any(Date),
    });
  });

  it('should handle sync errors and mark job as failed', async () => {
    const mockShop = {
      id: 'shop-2',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    const mockSyncJob = { id: 'sync-job-2' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Supabase mock (il clear prodotti gira prima di getProducts).
    const mockGte = vi.fn().mockReturnValue({ error: null });
    const mockLt = vi.fn().mockReturnValue({ error: null });
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({ gte: mockGte, lt: mockLt }),
        upsert: vi.fn().mockReturnValue({ error: null }),
      }),
    } as any);

    // Mock Shopify API to throw error
    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockRejectedValue(new Error('Shopify API error')),
    } as any));

    const mockJob = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job;

    // Expect the sync to throw
    await expect(processInitialBulkSync('shop-2', mockJob)).rejects.toThrow('Shopify API error');

    // Verify SyncJob was marked as failed
    const failedCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.status === 'failed'
    );
    expect(failedCall).toBeDefined();
    expect(failedCall?.[0].data).toMatchObject({
      status: 'failed',
      completedAt: expect.any(Date),
      errors: {
        message: 'Shopify API error',
      },
    });
  });

  it('should cap synced products to the plan maxProducts limit', async () => {
    const mockShop = {
      id: 'shop-free',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      currentPlan: 'free',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    // Piano con tetto di 2 prodotti.
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ maxProducts: 2 } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: 'sync-free' } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Una sola pagina con 3 prodotti (più del limite) e un cursore successivo:
    // il cap deve fermare la paginazione senza chiedere la pagina 2.
    const page = [
      { id: 1, title: 'P1', variants: [{ id: 101 }] },
      { id: 2, title: 'P2', variants: [{ id: 201 }] },
      { id: 3, title: 'P3', variants: [{ id: 301 }] },
    ];
    const mockGetProducts = vi.fn().mockResolvedValue({ products: page, nextPageInfo: 'page-2' });
    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: mockGetProducts,
    } as any));

    vi.mocked(transformProduct).mockImplementation((p: any) => [
      { shopify_product_id: p.id, shopify_variant_id: p.variants[0].id, is_variant: true } as any,
    ]);

    const mockGte = vi.fn().mockReturnValue({ error: null });
    const mockLt = vi.fn().mockReturnValue({ error: null });
    const mockUpsert = vi.fn().mockReturnValue({ error: null });
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({ gte: mockGte, lt: mockLt }),
        upsert: mockUpsert,
      }),
    } as any);

    const mockJob = { updateProgress: vi.fn().mockResolvedValue(undefined) } as unknown as Job;

    await processInitialBulkSync('shop-free', mockJob);

    // Solo 2 prodotti trasformati (cap), e paginazione fermata dopo la pagina 1.
    expect(transformProduct).toHaveBeenCalledTimes(2);
    expect(mockGetProducts).toHaveBeenCalledTimes(1);

    // Job completato con productsSynced = 2.
    const completedCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.status === 'completed'
    );
    expect(completedCall).toBeDefined();

    const progressCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.productsSynced === 2
    );
    expect(progressCall).toBeDefined();
  });

  it('should throw error if shop not configured for sync', async () => {
    const mockShop = {
      id: 'shop-3',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: null,
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    const mockJob = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job;

    await expect(processInitialBulkSync('shop-3', mockJob)).rejects.toThrow(
      'Shop shop-3 not configured for sync'
    );
  });

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
        delete: () => ({
          gte: async () => ({ error: null }),
          lt: async () => ({ error: null }),
        }),
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
    // non consuma quota. (updateProgress riceve i totali cumulativi; qui c'è una
    // sola pagina, quindi coincidono coi totali di pagina.)
    expect(job.updateProgress).toHaveBeenCalledWith({ products: 1, variants: 1 });
  });

  it('non azzera piu la tabella prodotti', async () => {
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

    const deleteCalls: { method: string; args: any[] }[] = [];
    const supabaseMock = {
      from: () => ({
        delete: () => ({
          gte: async (...a: any[]) => { deleteCalls.push({ method: 'gte', args: a }); return { error: null }; },
          lt: async (...a: any[]) => { deleteCalls.push({ method: 'lt', args: a }); return { error: null }; },
        }),
        upsert: async () => ({ error: null }),
      }),
    };
    (createSupabaseClient as any).mockReturnValue(supabaseMock);
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
    }));

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // L'azzeramento totale passava da delete().gte('shopify_product_id', 0).
    expect(deleteCalls.some((c) => c.method === 'gte')).toBe(false);
  });

  it('spazza le righe non toccate dopo una scansione completa', async () => {
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

    const deleteCalls: { method: string; args: any[] }[] = [];
    const supabaseMock = {
      from: () => ({
        delete: () => ({
          gte: async (...a: any[]) => { deleteCalls.push({ method: 'gte', args: a }); return { error: null }; },
          lt: async (...a: any[]) => { deleteCalls.push({ method: 'lt', args: a }); return { error: null }; },
        }),
        upsert: async () => ({ error: null }),
      }),
    };
    (createSupabaseClient as any).mockReturnValue(supabaseMock);
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [{ id: 1 }], nextPageInfo: null }),
    }));
    (transformProduct as any).mockReturnValue([
      { shopify_product_id: 1, shopify_variant_id: 10, cost_per_item: 5 },
    ]);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    const sweep = deleteCalls.find((c) => c.method === 'lt');
    expect(sweep).toBeDefined();
    expect(sweep!.args[0]).toBe('synced_at');
  });

  it('non spazza nulla se la scansione fallisce a meta', async () => {
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

    const deleteCalls: { method: string; args: any[] }[] = [];
    const supabaseMock = {
      from: () => ({
        delete: () => ({
          gte: async (...a: any[]) => { deleteCalls.push({ method: 'gte', args: a }); return { error: null }; },
          lt: async (...a: any[]) => { deleteCalls.push({ method: 'lt', args: a }); return { error: null }; },
        }),
        upsert: async () => ({ error: null }),
      }),
    };
    (createSupabaseClient as any).mockReturnValue(supabaseMock);
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi
        .fn()
        .mockResolvedValueOnce({ products: [{ id: 1 }], nextPageInfo: 'p2' })
        .mockRejectedValueOnce(new Error('Shopify API error')),
    }));

    await expect(
      processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any),
    ).rejects.toThrow();

    // Nessuna cancellazione: meglio righe obsolete che perdere prodotti veri.
    expect(deleteCalls.some((c) => c.method === 'lt')).toBe(false);
  });

  it('spazza anche quando si raggiunge il tetto del piano', async () => {
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
    (prisma.plan.findUnique as any).mockResolvedValue({ maxProducts: 1, customersSyncEnabled: false });
    (prisma.syncJob.create as any).mockResolvedValue({ id: 'job-1' });
    (prisma.syncJob.update as any).mockResolvedValue({});

    const deleteCalls: { method: string; args: any[] }[] = [];
    const supabaseMock = {
      from: () => ({
        delete: () => ({
          gte: async (...a: any[]) => { deleteCalls.push({ method: 'gte', args: a }); return { error: null }; },
          lt: async (...a: any[]) => { deleteCalls.push({ method: 'lt', args: a }); return { error: null }; },
        }),
        upsert: async () => ({ error: null }),
      }),
    };
    (createSupabaseClient as any).mockReturnValue(supabaseMock);
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [{ id: 1 }, { id: 2 }], nextPageInfo: 'p2' }),
    }));
    (transformProduct as any).mockImplementation((p: any) => [
      { shopify_product_id: p.id, shopify_variant_id: p.id * 10, cost_per_item: 5 },
    ]);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // Il tetto e' una terminazione regolare: la spazzata deve avvenire.
    expect(deleteCalls.some((c) => c.method === 'lt')).toBe(true);
  });

  it('registra il piano usato quando la sync si completa', async () => {
    const mockShop = {
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      authorization: 'ENABLED',
      currentPlan: 'pro',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        tableNameCustomers: 'customers',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'k',
        supabaseServiceRoleKey: 's',
      },
    };
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ maxProducts: null, customersSyncEnabled: false } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: 'job-1' } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);
    vi.mocked(prisma.shop.update).mockResolvedValue({} as any);

    const mockGte = vi.fn().mockReturnValue({ error: null });
    const mockLt = vi.fn().mockReturnValue({ error: null });
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: () => ({
        upsert: vi.fn().mockReturnValue({ error: null }),
        delete: () => ({ gte: mockGte, lt: mockLt }),
      }),
    } as any);
    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
    }) as any);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    expect(prisma.shop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shop-1' },
        data: expect.objectContaining({ lastSyncedPlan: 'pro' }),
      }),
    );
  });

  it('sincronizza solo i clienti opt-in', async () => {
    const mockShop = {
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      authorization: 'ENABLED',
      currentPlan: 'pro',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        tableNameCustomers: 'customers',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'k',
        supabaseServiceRoleKey: 's',
      },
    };
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ maxProducts: null, customersSyncEnabled: true } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: 'job-1' } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);
    vi.mocked(prisma.shop.update).mockResolvedValue({} as any);

    const upserted: any[] = [];
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: () => ({
        upsert: (rows: any[]) => { upserted.push(...rows); return { error: null }; },
        delete: () => ({
          gte: vi.fn().mockReturnValue({ error: null }),
          lt: vi.fn().mockReturnValue({ error: null }),
        }),
      }),
    } as any);

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
      getCustomers: vi.fn().mockResolvedValue({
        customers: [
          { id: 1, email: 'si@x.it', email_marketing_consent: { state: 'subscribed' } },
          { id: 2, email: 'no@x.it', email_marketing_consent: { state: 'unsubscribed' } },
          { id: 3, email: 'legacy@x.it', accepts_marketing: true },
        ],
        nextPageInfo: null,
      }),
    }) as any);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // Solo i due consenzienti (nidificato subscribed + legacy true).
    const customerIds = upserted
      .filter((r) => r.shopify_customer_id != null)
      .map((r) => r.shopify_customer_id);
    expect(customerIds).toEqual([1, 3]);
  });
});

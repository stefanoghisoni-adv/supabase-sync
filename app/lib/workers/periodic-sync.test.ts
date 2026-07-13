import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies BEFORE imports (using factory functions)
vi.mock('../../db.server', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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

// Import after mocks
import { processPeriodicSyncCheck } from './processors.server';
import { ShopifyAPIClient } from '../shopify-api.server';
import { createSupabaseClient } from '../supabase.server';
import { transformProduct } from '../transformers/product.server';
import { prisma } from '../../db.server';

describe('Periodic sync check processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync only updated products with delta detection and orphaned variant deletion', async () => {
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
        updatedAt: new Date('2026-07-10T00:00:00Z'),
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    // Mock last sync job (periodic_check completed at specific time)
    const lastSyncTime = new Date('2026-07-12T12:00:00Z');
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue({
      id: 'last-sync-job',
      completedAt: lastSyncTime,
    } as any);

    // Mock SyncJob create
    const mockSyncJob = { id: 'sync-job-1' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Mock Shopify API client - only updated products since lastSyncTime
    const mockUpdatedProducts = [
      // Product 1: has 2 variants currently
      { id: 1, title: 'Product 1', variants: [{ id: 101, title: 'Variant 1' }, { id: 102, title: 'Variant 2' }] },
    ];

    const mockGetProducts = vi.fn().mockResolvedValueOnce({
      products: mockUpdatedProducts,
      nextPageInfo: null,
    });

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: mockGetProducts,
    } as any));

    // Mock transformProduct - Product 1 now has 2 variants
    vi.mocked(transformProduct).mockReturnValueOnce([
      { shopify_product_id: 1, shopify_variant_id: 101, is_variant: true, title: 'Product 1 - Variant 1' } as any,
      { shopify_product_id: 1, shopify_variant_id: 102, is_variant: true, title: 'Product 1 - Variant 2' } as any,
    ]);

    // Mock Supabase client
    // Existing rows in DB: Product 1 has 3 variants (101, 102, 103)
    // Variant 103 is orphaned (deleted in Shopify)
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          { shopify_variant_id: 101 },
          { shopify_variant_id: 102 },
          { shopify_variant_id: 103 }, // This one will be orphaned
        ],
      }),
    });

    const mockDelete = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });

    const mockFrom = vi.fn().mockImplementation((tableName) => ({
      select: mockSelect,
      delete: mockDelete,
      upsert: mockUpsert,
    }));

    vi.mocked(createSupabaseClient).mockReturnValue({
      from: mockFrom,
    } as any);

    // Execute periodic sync
    await processPeriodicSyncCheck('shop-1');

    // Verify shop was loaded with config
    expect(prisma.shop.findUnique).toHaveBeenCalledWith({
      where: { id: 'shop-1' },
      include: { supabaseConfig: true },
    });

    // Verify last sync job was queried
    expect(prisma.syncJob.findFirst).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        jobType: 'periodic_check',
        status: 'completed',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    // Verify SyncJob was created as 'running'
    expect(prisma.syncJob.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop-1',
        jobType: 'periodic_check',
        status: 'running',
      },
    });

    // Verify getProducts was called with updatedAtMin (delta)
    expect(mockGetProducts).toHaveBeenCalledWith({
      limit: 250,
      pageInfo: undefined,
      updatedAtMin: lastSyncTime.toISOString(),
    });

    // Verify existing rows were fetched for delta detection
    expect(mockSelect).toHaveBeenCalled();

    // Verify orphaned variant (103) was deleted
    expect(mockDelete).toHaveBeenCalled();
    const deleteInCall = mockDelete().in;
    expect(deleteInCall).toHaveBeenCalledWith('shopify_variant_id', [103]);

    // Verify SEPARATED upserts for variant rows
    expect(mockUpsert).toHaveBeenCalled();

    // Verify at least one upsert with 'shopify_variant_id' conflict (variant rows)
    const variantUpsertCalls = vi.mocked(mockUpsert).mock.calls.filter(
      call => call[1]?.onConflict === 'shopify_variant_id'
    );
    expect(variantUpsertCalls.length).toBeGreaterThan(0);

    // Verify SyncJob was marked as completed
    const completedCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.status === 'completed'
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.[0].data).toMatchObject({
      status: 'completed',
      completedAt: expect.any(Date),
      productsSynced: 1,
      variantsSynced: 2,
    });
  });

  it('should use supabaseConfig.updatedAt as fallback when no last sync job exists', async () => {
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
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    // No last sync job found
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue(null);

    const mockSyncJob = { id: 'sync-job-2' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    const mockGetProducts = vi.fn().mockResolvedValueOnce({
      products: [],
      nextPageInfo: null,
    });

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: mockGetProducts,
    } as any));

    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn(),
    } as any);

    await processPeriodicSyncCheck('shop-2');

    // Verify getProducts was called with supabaseConfig.updatedAt as fallback
    expect(mockGetProducts).toHaveBeenCalledWith({
      limit: 250,
      pageInfo: undefined,
      updatedAtMin: mockShop.supabaseConfig.updatedAt.toISOString(),
    });
  });

  it('should handle errors and mark job as failed', async () => {
    const mockShop = {
      id: 'shop-3',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
        updatedAt: new Date('2026-07-10T00:00:00Z'),
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue(null);

    const mockSyncJob = { id: 'sync-job-3' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Mock Shopify API to throw error
    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockRejectedValue(new Error('Shopify API error')),
    } as any));

    // Expect the sync to throw
    await expect(processPeriodicSyncCheck('shop-3')).rejects.toThrow('Shopify API error');

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

  it('should skip sync if shop not configured or sync disabled', async () => {
    const mockShop = {
      id: 'shop-4',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: {
        syncEnabled: false, // Sync disabled
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
        updatedAt: new Date('2026-07-10T00:00:00Z'),
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

    await processPeriodicSyncCheck('shop-4');

    // Verify no sync job was created
    expect(prisma.syncJob.create).not.toHaveBeenCalled();
  });

  it('should handle pagination correctly', async () => {
    const mockShop = {
      id: 'shop-5',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'encrypted-key',
        supabaseServiceRoleKey: 'encrypted-service',
        updatedAt: new Date('2026-07-10T00:00:00Z'),
      },
    };

    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue(null);

    const mockSyncJob = { id: 'sync-job-5' };
    vi.mocked(prisma.syncJob.create).mockResolvedValue(mockSyncJob as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);

    // Mock pagination: 2 pages
    let callCount = 0;
    const mockGetProducts = vi.fn().mockImplementation(async (options) => {
      callCount++;
      if (callCount === 1) {
        return {
          products: [{ id: 1, title: 'Product 1', variants: [{ id: 101, title: 'V1' }] }],
          nextPageInfo: 'page-2-token',
        };
      }
      if (callCount === 2) {
        return {
          products: [{ id: 2, title: 'Product 2', variants: [{ id: 201, title: 'V2' }] }],
          nextPageInfo: null,
        };
      }
      return { products: [], nextPageInfo: null };
    });

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: mockGetProducts,
    } as any));

    vi.mocked(transformProduct)
      .mockReturnValueOnce([{ shopify_product_id: 1, shopify_variant_id: 101, is_variant: true } as any])
      .mockReturnValueOnce([{ shopify_product_id: 2, shopify_variant_id: 201, is_variant: true } as any]);

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [] }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(createSupabaseClient).mockReturnValue({
      from: mockFrom,
    } as any);

    await processPeriodicSyncCheck('shop-5');

    // Verify pagination: getProducts called twice
    expect(mockGetProducts).toHaveBeenCalledTimes(2);

    // Second call should use nextPageInfo
    expect(mockGetProducts).toHaveBeenNthCalledWith(2, {
      limit: 250,
      pageInfo: 'page-2-token',
      updatedAtMin: expect.any(String),
    });

    // Verify 2 products were synced
    const completedCall = vi.mocked(prisma.syncJob.update).mock.calls.find(
      (call: any) => call[0].data?.status === 'completed'
    );
    expect(completedCall?.[0].data).toMatchObject({
      productsSynced: 2,
      variantsSynced: 2,
    });
  });
});

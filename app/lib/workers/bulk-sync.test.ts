import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock all dependencies BEFORE imports (using factory functions)
vi.mock('../../db.server', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
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

    const mockFrom = vi.fn().mockReturnValue({
      upsert: mockUpsert,
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
});

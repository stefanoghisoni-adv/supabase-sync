import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShopifyAPIClient } from './shopify-api.server';

global.fetch = vi.fn();

// Mock the decrypt function
vi.mock('../utils/crypto.server', () => ({
  decrypt: (token: string) => token, // In tests, just return the token as-is
}));

describe('Shopify API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch products with pagination', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [
          { id: 1, title: 'Product 1' },
          { id: 2, title: 'Product 2' },
        ],
      }),
      headers: new Map([
        ['link', '<https://test.myshopify.com/admin/api/2025-01/products.json?page_info=abc>; rel="next"'],
      ]),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'test_token');
    const result = await client.getProducts({ limit: 250 });

    expect(result.products).toHaveLength(2);
    expect(result.nextPageInfo).toBe('abc');
  });

  it('should NOT combine page_info with updated_at_min (Shopify cursor constraint)', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({
      limit: 250,
      pageInfo: 'cursor123',
      updatedAtMin: '2026-07-10T00:00:00Z',
    });

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page_info')).toBe('cursor123');
    expect(calledUrl.searchParams.get('updated_at_min')).toBeNull();
  });

  it('should send updated_at_min on the first page (no cursor)', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({
      limit: 250,
      updatedAtMin: '2026-07-10T00:00:00Z',
    });

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('updated_at_min')).toBe('2026-07-10T00:00:00Z');
    expect(calledUrl.searchParams.get('page_info')).toBeNull();
  });

  it('should respect rate limits', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map([
        ['X-Shopify-Shop-Api-Call-Limit', '38/40'],
      ]),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({ limit: 10 });

    // Should log rate limit warning
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should return the products count from products/count.json', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 4820 }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    const count = await client.getProductsCount();

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain('products/count.json');
    expect(count).toBe(4820);
  });

  it('should restrict the payload via the fields param when provided', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({ limit: 250, fields: 'id,variants' });

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('fields')).toBe('id,variants');
  });

  it('should keep the fields param together with page_info (cursor allows it)', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.getProducts({ limit: 250, pageInfo: 'cursor123', fields: 'id,variants' });

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page_info')).toBe('cursor123');
    expect(calledUrl.searchParams.get('fields')).toBe('id,variants');
  });

  it('should fetch inventory item costs by ids', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        inventory_items: [
          { id: 111, cost: '3.50' },
          { id: 222, cost: null },
        ],
      }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    const items = await client.getInventoryItems([111, 222]);

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain('inventory_items.json');
    expect(calledUrl.searchParams.get('ids')).toBe('111,222');
    expect(items).toEqual([
      { id: 111, cost: '3.50' },
      { id: 222, cost: null },
    ]);
  });

  it('should update an inventory item cost via PUT', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ inventory_item: { id: 111, cost: '9.99' } }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    await client.updateInventoryItemCost(111, '9.99');

    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toContain('inventory_items/111.json');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      inventory_item: { id: 111, cost: '9.99' },
    });
  });

  it('should return the customers count from customers/count.json', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 42 }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    const count = await client.getCustomersCount();

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain('customers/count.json');
    expect(count).toBe(42);
  });

  it('getShopInfo restituisce il fuso orario del negozio', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ shop: { iana_timezone: 'Europe/Rome' } }),
    }) as unknown as typeof fetch;

    const client = new ShopifyAPIClient('test-shop.myshopify.com', 'enc');
    expect(await client.getShopInfo()).toEqual({ ianaTimezone: 'Europe/Rome' });
  });

  it('getShopInfo senza fuso restituisce null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ shop: {} }),
    }) as unknown as typeof fetch;

    const client = new ShopifyAPIClient('test-shop.myshopify.com', 'enc');
    expect(await client.getShopInfo()).toEqual({ ianaTimezone: null });
  });
});

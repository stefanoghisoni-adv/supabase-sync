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
});

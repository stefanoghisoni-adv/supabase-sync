import { decrypt } from '../utils/crypto.server';

export class ShopifyAPIClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;

  constructor(shopDomain: string, encryptedAccessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = decrypt(encryptedAccessToken);
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  }

  private async makeRequest(endpoint: string, params?: Record<string, any>) {
    const url = new URL(`https://${this.shopDomain}/admin/api/${this.apiVersion}/${endpoint}`);

    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined) {
          url.searchParams.append(key, String(params[key]));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    // Check rate limit
    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitHeader) {
      const [current, max] = rateLimitHeader.split('/').map(Number);
      if (current >= max * 0.9) {
        console.warn(`Approaching rate limit: ${current}/${max}`);
        await this.sleep(500); // Throttle
      }
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract next page info from Link header
    const linkHeader = response.headers.get('link');
    let nextPageInfo: string | null = null;

    if (linkHeader) {
      const nextLinkMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (nextLinkMatch) {
        nextPageInfo = nextLinkMatch[1];
      }
    }

    return { data, nextPageInfo };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getProducts(options: {
    limit?: number;
    pageInfo?: string;
    updatedAtMin?: string;
  } = {}) {
    const params: Record<string, any> = {
      limit: options.limit || 250,
    };

    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    }

    if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    const { data, nextPageInfo } = await this.makeRequest('products.json', params);

    return {
      products: data.products,
      nextPageInfo,
    };
  }

  async getProductById(productId: number) {
    const { data } = await this.makeRequest(`products/${productId}.json`);
    return data.product;
  }

  async getCustomers(options: {
    limit?: number;
    pageInfo?: string;
    updatedAtMin?: string;
  } = {}) {
    const params: Record<string, any> = {
      limit: options.limit || 250,
    };

    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    }

    if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    const { data, nextPageInfo } = await this.makeRequest('customers.json', params);

    return {
      customers: data.customers,
      nextPageInfo,
    };
  }
}

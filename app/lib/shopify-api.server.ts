import { unauthenticated } from '~/shopify.server';

export class ShopifyAPIClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;
  private readonly RATE_LIMIT_THRESHOLD = 0.9;
  private readonly THROTTLE_DELAY_MS = 500;

  /** Il token va passato in chiaro: chi lo procura e' `forShop`. */
  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  }

  // Unico modo corretto di costruire il client. Il token NON si legge piu' dalla
  // copia cifrata in `shops.access_token`: da quando Shopify impone i token a
  // scadenza (un'ora), una copia congelata all'installazione e' garantita
  // scaduta, e l'API risponde 403. `unauthenticated.admin` carica la sessione
  // corrente e, se manca meno di 5 minuti alla scadenza, la rinnova con il
  // refresh token prima di restituirla — anche fuori da una richiesta HTTP
  // autenticata, quindi vale anche per i worker e per il cron.
  static async forShop(shopDomain: string): Promise<ShopifyAPIClient> {
    const { session } = await unauthenticated.admin(shopDomain);
    return new ShopifyAPIClient(shopDomain, session.accessToken ?? '');
  }

  private async makeRequest(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: { method?: string; body?: unknown },
  ) {
    const url = new URL(`https://${this.shopDomain}/admin/api/${this.apiVersion}/${endpoint}`);

    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined) {
          url.searchParams.append(key, String(params[key]));
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: options?.method ?? 'GET',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    // Check rate limit
    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitHeader) {
      const [current, max] = rateLimitHeader.split('/').map(Number);
      if (current >= max * this.RATE_LIMIT_THRESHOLD) {
        console.warn(`Approaching rate limit: ${current}/${max}`);
        await this.sleep(this.THROTTLE_DELAY_MS); // Throttle
      }
    }

    if (!response.ok) {
      // Il corpo va letto: Shopify ci scrive il motivo vero, e senza di esso un
      // 403 "Forbidden" e' indistinguibile da un altro. E' costato una diagnosi
      // sbagliata, quando il messaggio "Non-expiring access tokens are no longer
      // accepted" era li' e lo stavamo buttando via.
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Shopify API error: ${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
      );
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
    fields?: string;
  } = {}) {
    const params: Record<string, string | number | boolean | undefined> = {
      limit: options.limit || 250,
    };

    // Shopify cursor pagination: page_info may only be combined with limit/fields.
    // The original filters (updated_at_min) are already encoded in the cursor, so
    // they must be dropped on subsequent pages or Shopify returns 400.
    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    } else if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    // `fields` restringe il payload (compatibile anche con page_info): utile per la
    // sola readiness, che legge esclusivamente variants.cost e non serve il resto.
    if (options.fields) {
      params.fields = options.fields;
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

  async getProductsCount(): Promise<number> {
    const { data } = await this.makeRequest('products/count.json');
    return typeof data.count === 'number' ? data.count : 0;
  }

  // Il cost_per_item vive sull'InventoryItem, non sulla variante: products.json NON
  // lo restituisce. Va letto (e scritto) tramite l'API inventory_items.
  async getInventoryItems(
    ids: number[],
  ): Promise<{ id: number; cost: string | null }[]> {
    if (ids.length === 0) return [];
    const { data } = await this.makeRequest('inventory_items.json', {
      ids: ids.join(','),
      limit: 250,
    });
    return (data.inventory_items ?? []).map(
      (it: { id: number; cost: string | null }) => ({ id: it.id, cost: it.cost ?? null }),
    );
  }

  async updateInventoryItemCost(
    inventoryItemId: number,
    cost: string,
  ): Promise<{ id: number; cost: string | null }> {
    const { data } = await this.makeRequest(
      `inventory_items/${inventoryItemId}.json`,
      undefined,
      { method: 'PUT', body: { inventory_item: { id: inventoryItemId, cost } } },
    );
    return data.inventory_item;
  }

  async getCustomers(options: {
    limit?: number;
    pageInfo?: string;
    updatedAtMin?: string;
  } = {}) {
    const params: Record<string, string | number | boolean | undefined> = {
      limit: options.limit || 250,
    };

    // Shopify cursor pagination: page_info may only be combined with limit/fields.
    if (options.pageInfo) {
      params.page_info = options.pageInfo;
    } else if (options.updatedAtMin) {
      params.updated_at_min = options.updatedAtMin;
    }

    const { data, nextPageInfo } = await this.makeRequest('customers.json', params);

    return {
      customers: data.customers,
      nextPageInfo,
    };
  }

  async getCustomersCount(): Promise<number> {
    const { data } = await this.makeRequest('customers/count.json');
    return typeof data.count === 'number' ? data.count : 0;
  }

  // Metadati del negozio. Serve iana_timezone (es. "Europe/Rome") per formattare
  // le date nel fuso del NEGOZIO: il server non puo' conoscere quello del browser,
  // e usare l'ora locale della macchina produrrebbe stringhe diverse fra render
  // server e idratazione client.
  async getShopInfo(): Promise<{
    ianaTimezone: string | null;
    /** Dominio su cui navigano i clienti: proprio se collegato, myshopify altrimenti. */
    primaryDomain: string | null;
  }> {
    const { data } = await this.makeRequest('shop.json');
    const shop = (data as {
      shop?: { iana_timezone?: string | null; domain?: string | null };
    }).shop;
    return {
      ianaTimezone: shop?.iana_timezone ?? null,
      primaryDomain: shop?.domain ?? null,
    };
  }
}

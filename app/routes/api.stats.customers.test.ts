// app/routes/api.stats.customers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueShop = vi.fn();
const findUniquePlan = vi.fn();
const getCustomers = vi.fn();
const getCustomerStatsCache = vi.fn();
const setCustomerStatsCache = vi.fn();

vi.mock('~/shopify.server', () => ({
  authenticate: { admin: async () => ({ session: { shop: 'test-shop.myshopify.com' } }) },
}));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => findUniqueShop(...a) },
    plan: { findUnique: (...a: unknown[]) => findUniquePlan(...a) },
  },
}));
vi.mock('~/lib/shopify-api.server', () => ({
  ShopifyAPIClient: class {
    getCustomers = (...a: unknown[]) => getCustomers(...a);
  },
}));
vi.mock('~/lib/cache/stats-cache.server', () => ({
  getCustomerStatsCache: (...a: unknown[]) => getCustomerStatsCache(...a),
  setCustomerStatsCache: (...a: unknown[]) => setCustomerStatsCache(...a),
}));

import { loader } from './api.stats.customers';

const call = (url = 'https://app/api/stats/customers') =>
  loader({ request: new Request(url), params: {}, context: {} } as any);

describe('/api/stats/customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueShop.mockResolvedValue({ id: 'shop-1', shopDomain: 'test-shop.myshopify.com', accessToken: 'enc', currentPlan: 'pro' });
  });

  it('piano senza clienti → enabled false e nessuna chiamata a Shopify', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: false });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: false, optIn: 0, optOut: 0 });
    expect(getCustomers).not.toHaveBeenCalled();
  });

  it('usa la cache quando presente', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: true });
    getCustomerStatsCache.mockResolvedValue({ totalCustomers: 10, optIn: 6, optOut: 4, computedAt: 'x' });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: true, totalCustomers: 10, optIn: 6, optOut: 4, cached: true });
    expect(getCustomers).not.toHaveBeenCalled();
  });

  it('senza cache pagina Shopify e somma i conteggi', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: true });
    getCustomerStatsCache.mockResolvedValue(null);
    getCustomers
      .mockResolvedValueOnce({
        customers: [
          { id: 1, email_marketing_consent: { state: 'subscribed' } },
          { id: 2, email_marketing_consent: { state: 'unsubscribed' } },
        ],
        nextPageInfo: 'p2',
      })
      .mockResolvedValueOnce({
        customers: [{ id: 3, accepts_marketing: true }],
        nextPageInfo: null,
      });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: true, totalCustomers: 3, optIn: 2, optOut: 1, cached: false });
    expect(setCustomerStatsCache).toHaveBeenCalled();
  });
});

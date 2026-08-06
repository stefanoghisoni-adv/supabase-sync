import { describe, it, expect, vi, beforeEach } from 'vitest';

const shopUpdate = vi.fn();
const getShopInfo = vi.fn();

vi.mock('~/db.server', () => ({
  prisma: { shop: { update: (...a: unknown[]) => shopUpdate(...a) } },
}));

vi.mock('~/lib/shopify-api.server', () => ({
  ShopifyAPIClient: Object.assign(vi.fn(() => ({ getShopInfo })), {
    forShop: vi.fn(async () => ({ getShopInfo })),
  }),
}));

import {
  refreshShopProfile,
  triggerShopProfileRefresh,
  clearShopProfileChecks,
} from './refresh-shop-profile.server';

const shop = (over: Record<string, unknown> = {}) => ({
  id: 'shop-1',
  shopDomain: 'negozio.myshopify.com',
  accessToken: 'token',
  ianaTimezone: 'Europe/Rome',
  primaryDomain: 'negozio.myshopify.com',
  ...over,
});

describe('refreshShopProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearShopProfileChecks();
    shopUpdate.mockResolvedValue({});
  });

  it('dominio collegato dopo l’installazione → si aggiorna', () => {
    getShopInfo.mockResolvedValue({ ianaTimezone: 'Europe/Rome', primaryDomain: 'negozio.it' });

    return refreshShopProfile(shop()).then(() => {
      expect(shopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { primaryDomain: 'negozio.it' } }),
      );
    });
  });

  it('niente di cambiato → nessuna scrittura', async () => {
    getShopInfo.mockResolvedValue({
      ianaTimezone: 'Europe/Rome',
      primaryDomain: 'negozio.myshopify.com',
    });

    await refreshShopProfile(shop());

    expect(shopUpdate).not.toHaveBeenCalled();
  });

  it('primo giro: riempie fuso e dominio insieme, con una sola chiamata', async () => {
    getShopInfo.mockResolvedValue({ ianaTimezone: 'Europe/Rome', primaryDomain: 'negozio.it' });

    await refreshShopProfile(shop({ ianaTimezone: null, primaryDomain: null }));

    expect(getShopInfo).toHaveBeenCalledTimes(1);
    expect(shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ianaTimezone: 'Europe/Rome', primaryDomain: 'negozio.it' },
      }),
    );
  });

  it('il fuso gia’ noto non viene riscritto anche se Shopify lo ripete', async () => {
    getShopInfo.mockResolvedValue({ ianaTimezone: 'America/New_York', primaryDomain: 'negozio.it' });

    await refreshShopProfile(shop());

    expect(shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { primaryDomain: 'negozio.it' } }),
    );
  });
});

describe('triggerShopProfileRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearShopProfileChecks();
    shopUpdate.mockResolvedValue({});
    getShopInfo.mockResolvedValue({ ianaTimezone: 'Europe/Rome', primaryDomain: 'negozio.it' });
  });

  it('aprire e riaprire l’app non chiama Shopify ogni volta', async () => {
    triggerShopProfileRefresh(shop());
    triggerShopProfileRefresh(shop());
    triggerShopProfileRefresh(shop());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getShopInfo).toHaveBeenCalledTimes(1);
  });

  it('negozi diversi non si bloccano a vicenda', async () => {
    triggerShopProfileRefresh(shop());
    triggerShopProfileRefresh(shop({ id: 'shop-2' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getShopInfo).toHaveBeenCalledTimes(2);
  });
});

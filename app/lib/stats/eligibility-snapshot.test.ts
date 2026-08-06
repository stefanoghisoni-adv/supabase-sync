import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();

vi.mock('~/db.server', () => ({
  prisma: {
    productEligibilitySnapshot: {
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

// Il modulo sotto test importa il client Shopify, che a sua volta importa
// shopify.server per procurarsi un token valido. Senza questo mock il session
// storage di Prisma si costruirebbe sul prisma finto qui sopra, che non ha la
// tabella session, e il file non verrebbe nemmeno caricato.
vi.mock('~/lib/shopify-api.server', () => ({
  ShopifyAPIClient: { forShop: vi.fn() },
}));

import { upsertTodayEligibilitySnapshot } from './eligibility-snapshot.server';

describe('upsertTodayEligibilitySnapshot', () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it('chiama upsert con la chiave shopId_day e eligibleCount in create e update', async () => {
    upsert.mockResolvedValueOnce({});

    await upsertTodayEligibilitySnapshot('shop-123', 42);

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as {
      where: { shopId_day: { shopId: string; day: Date } };
      create: { shopId: string; day: Date; eligibleCount: number };
      update: { eligibleCount: number };
    };

    // Verifica la chiave composta
    expect(arg.where.shopId_day.shopId).toBe('shop-123');
    expect(arg.where.shopId_day.day).toBeInstanceOf(Date);
    // Il day deve essere la mezzanotte UTC di oggi
    const now = new Date();
    const expectedDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    expect(arg.where.shopId_day.day.getTime()).toBe(expectedDay.getTime());

    // Verifica create
    expect(arg.create.shopId).toBe('shop-123');
    expect(arg.create.day.getTime()).toBe(expectedDay.getTime());
    expect(arg.create.eligibleCount).toBe(42);

    // Verifica update
    expect(arg.update.eligibleCount).toBe(42);
  });
});

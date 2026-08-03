// app/routes/billing.callback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueShop = vi.fn();
const updateShop = vi.fn();
const findUniquePlan = vi.fn();
const updateManyCharges = vi.fn();

const getSubscription = vi.fn();
const getActiveSubscriptions = vi.fn();
const cancelAppSubscription = vi.fn();

const admin = { graphql: vi.fn() };

vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin }),
  },
}));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: {
      findUnique: (...a: unknown[]) => findUniqueShop(...a),
      update: (...a: unknown[]) => updateShop(...a),
    },
    plan: { findUnique: (...a: unknown[]) => findUniquePlan(...a) },
    billingCharge: { updateMany: (...a: unknown[]) => updateManyCharges(...a) },
  },
}));
vi.mock('~/lib/billing/subscription.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/billing/subscription.server')>(
    '~/lib/billing/subscription.server',
  );
  return {
    // parseGidId resta quello vero: e' pura conversione di formato.
    parseGidId: actual.parseGidId,
    getSubscription: (...a: unknown[]) => getSubscription(...a),
    getActiveSubscriptions: (...a: unknown[]) => getActiveSubscriptions(...a),
    cancelAppSubscription: (...a: unknown[]) => cancelAppSubscription(...a),
  };
});

import { loader } from './billing.callback';

const SHOP = {
  id: 'shop-1',
  shopDomain: 'test-shop.myshopify.com',
  currentPlan: 'Free',
  activeChargeId: null as string | null,
  authorization: 'ENABLED',
  trackingAuthorization: 'ENABLED',
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    gid: 'gid://shopify/AppSubscription/1234',
    name: 'Pro',
    status: 'ACTIVE',
    test: false,
    trialDays: 7,
    currentPeriodEnd: '2026-09-03T10:00:00Z',
    priceAmount: 29,
    ...overrides,
  };
}

function call(query = '?charge_id=1234&shop=test-shop.myshopify.com') {
  const request = new Request(`https://app.example.com/billing/callback${query}`);
  return loader({ request, params: {}, context: {} } as any) as Promise<Response>;
}

/** Esito e contesto embedded del rimando alla tab Piano. */
function location(res: Response): URL {
  return new URL(res.headers.get('location') ?? '', 'https://app.example.com');
}

describe('/billing/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueShop.mockResolvedValue({ ...SHOP });
    findUniquePlan.mockResolvedValue({ planName: 'Pro', priceMonthly: 29, trialDays: 7 });
    getActiveSubscriptions.mockResolvedValue([]);
  });

  it('senza charge_id valido non interroga Shopify e torna con esito negativo', async () => {
    const res = await call('?shop=test-shop.myshopify.com');
    expect(getSubscription).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
  });

  it('abbonamento rifiutato: addebito segnato e piano invariato', async () => {
    getSubscription.mockResolvedValue(subscription({ status: 'DECLINED' }));

    const res = await call();

    expect(updateManyCharges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-1', shopifyChargeId: 1234n },
        data: expect.objectContaining({ status: 'declined' }),
      }),
    );
    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
  });

  it('abbonamento ancora in attesa: non cambia nulla', async () => {
    getSubscription.mockResolvedValue(subscription({ status: 'PENDING' }));

    const res = await call();

    expect(updateManyCharges).not.toHaveBeenCalled();
    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
  });

  it('abbonamento sconosciuto a Shopify: nessuna attivazione', async () => {
    getSubscription.mockResolvedValue(null);

    const res = await call('?charge_id=999999&shop=test-shop.myshopify.com');

    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
  });

  it('abbonamento attivo con un nome fuori dal listino: nessuna attivazione', async () => {
    getSubscription.mockResolvedValue(subscription({ name: 'Piano Altrui' }));
    findUniquePlan.mockResolvedValue(null);

    const res = await call();

    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
  });

  it('abbonamento attivo: aggiorna addebito e piano, e chiude il precedente', async () => {
    getSubscription.mockResolvedValue(subscription());
    getActiveSubscriptions.mockResolvedValue([
      subscription(),
      subscription({ gid: 'gid://shopify/AppSubscription/9876', name: 'Business' }),
    ]);

    const res = await call();

    expect(updateManyCharges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-1', shopifyChargeId: 1234n },
        data: expect.objectContaining({ status: 'active', trialDays: 7 }),
      }),
    );
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shop-1' },
        data: expect.objectContaining({
          currentPlan: 'Pro',
          activeChargeId: '1234',
          billingCycle: 'monthly',
          isInTrial: true,
        }),
      }),
    );
    // Solo il precedente viene chiuso: quello appena confermato resta.
    expect(cancelAppSubscription).toHaveBeenCalledTimes(1);
    expect(cancelAppSubscription).toHaveBeenCalledWith(
      admin,
      'gid://shopify/AppSubscription/9876',
    );
    expect(updateManyCharges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-1', shopifyChargeId: 9876n },
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );
    expect(location(res).searchParams.get('billing')).toBe('ok');
  });

  it('il rimando alla tab Piano porta con se il contesto embedded', async () => {
    getSubscription.mockResolvedValue(subscription());

    const url = location(await call());

    expect(url.pathname).toBe('/plan');
    expect(url.searchParams.get('shop')).toBe('test-shop.myshopify.com');
    expect(url.searchParams.get('embedded')).toBe('1');
    expect(
      Buffer.from(url.searchParams.get('host') ?? '', 'base64').toString('utf8'),
    ).toBe('admin.shopify.com/store/test-shop');
  });

  it('la chiusura del precedente non annulla l attivazione appena registrata', async () => {
    getSubscription.mockResolvedValue(subscription());
    getActiveSubscriptions.mockRejectedValue(new Error('rete'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await call();

    expect(updateShop).toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ok');
    warnSpy.mockRestore();
  });

  it('guasto nella verifica: piano invariato ed esito negativo', async () => {
    getSubscription.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call();

    expect(updateShop).not.toHaveBeenCalled();
    expect(location(res).searchParams.get('billing')).toBe('ko');
    errorSpy.mockRestore();
  });
});

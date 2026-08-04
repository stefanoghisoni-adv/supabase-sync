import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/webhooks/verify.server', () => ({ verifyWebhook: () => true }));
vi.mock('~/lib/billing/apply-plan.server', () => ({
  applyPlanToShop: vi.fn(),
}));
// Le due ricerche di piano restano distinte di proposito: il piano
// dell'abbonamento passa da findPlanByName (confronto per nome, insensibile a
// maiuscole), quello gratuito da una query per prezzo. Mockarle insieme
// renderebbe impossibile distinguerle.
vi.mock('~/lib/billing/find-plan.server', () => ({
  findPlanByName: vi.fn(),
}));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: vi.fn() },
    plan: { findFirst: vi.fn() },
    billingCharge: { updateMany: vi.fn() },
  },
}));

import { action } from './webhooks.app-subscriptions.update';
import { applyPlanToShop } from '~/lib/billing/apply-plan.server';
import { findPlanByName } from '~/lib/billing/find-plan.server';
import { prisma } from '~/db.server';

function req(
  payload: object,
  shopDomain = 'test-shop.myshopify.com',
): Request {
  return new Request('https://app/webhooks/app-subscriptions/update', {
    method: 'POST',
    headers: {
      'X-Shopify-Hmac-Sha256': 'valid-sig',
      'X-Shopify-Shop-Domain': shopDomain,
    },
    body: JSON.stringify(payload),
  });
}

describe('webhook app_subscriptions/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('negozio sconosciuto → 200, nessuna azione', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue(null);

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'pro',
        status: 'ACTIVE',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('payload incompleto → 200, nessuna azione', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({ id: 'shop-1' });

    const res1 = await action({
      request: req({ app_subscription: { status: 'ACTIVE' } }),
    } as any);
    const res2 = await action({
      request: req({ app_subscription: { name: 'pro' } }),
    } as any);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('ACTIVE + piano nel listino → applica il piano', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '999',
    });
    (findPlanByName as any).mockResolvedValue({
      planName: 'pro',
      trialDays: 7,
    });
    (prisma.billingCharge.updateMany as any).mockResolvedValue({});

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'pro',
        status: 'ACTIVE',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).toHaveBeenCalledWith({
      shopId: 'shop-1',
      planName: 'pro',
      chargeId: '123',
      trialDays: 7,
    });
    expect(prisma.billingCharge.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', shopifyChargeId: 123n },
      data: { status: 'active', activatedAt: expect.any(Date) },
    });
  });

  it('ACTIVE gia allineato → non riapplica (il periodo di prova non riparte)', async () => {
    // Shopify puo' consegnare piu' volte lo stesso ACTIVE. Riapplicare il piano
    // ricalcolerebbe trialEndsAt da adesso, regalando giorni di prova a ogni
    // consegna. Il confronto sul nome non guarda le maiuscole: il listino puo'
    // essere stato rinominato dopo l'attivazione.
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      currentPlan: 'pro',
      activeChargeId: '123',
    });
    (findPlanByName as any).mockResolvedValue({ planName: 'Pro', trialDays: 7 });

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'Pro',
        status: 'ACTIVE',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('ACTIVE + piano non nel listino → ignora', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({ id: 'shop-1' });
    (findPlanByName as any).mockResolvedValue(null);

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'unknown-plan',
        status: 'ACTIVE',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('PENDING → ignora', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({ id: 'shop-1' });

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'pro',
        status: 'PENDING',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('CANCELLED dell\'abbonamento NON attivo → ignora (cambio piano in corso)', async () => {
    // Questo e' il test piu' critico: durante un cambio piano, la callback
    // cancella l'abbonamento precedente. Shopify manda un CANCELLED per quello.
    // Senza il confronto con activeChargeId, il merchant che ha appena pagato
    // un upgrade verrebbe retrocesso al piano gratuito.
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '999', // abbonamento attivo diverso
    });

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'basic',
        status: 'CANCELLED',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
    expect(prisma.plan.findFirst).not.toHaveBeenCalled();
  });

  it('CANCELLED dell\'abbonamento attivo → riporta al piano gratuito', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '123', // questo abbonamento e' quello attivo
    });
    (prisma.plan.findFirst as any).mockResolvedValue({
      planName: 'free',
      priceMonthly: 0,
    });
    (prisma.billingCharge.updateMany as any).mockResolvedValue({});

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'pro',
        status: 'CANCELLED',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { priceMonthly: 0 },
      orderBy: { createdAt: 'asc' },
    });
    expect(applyPlanToShop).toHaveBeenCalledWith({
      shopId: 'shop-1',
      planName: 'free',
      chargeId: null,
      trialDays: null,
    });
    expect(prisma.billingCharge.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', shopifyChargeId: 123n },
      data: { status: 'cancelled', cancelledAt: expect.any(Date) },
    });
  });

  it('EXPIRED dell\'abbonamento attivo → riporta al piano gratuito', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '456',
    });
    (prisma.plan.findFirst as any).mockResolvedValue({
      planName: 'free',
      priceMonthly: 0,
    });
    (prisma.billingCharge.updateMany as any).mockResolvedValue({});

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/456',
        name: 'pro',
        status: 'EXPIRED',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).toHaveBeenCalledWith({
      shopId: 'shop-1',
      planName: 'free',
      chargeId: null,
      trialDays: null,
    });
  });

  it('DECLINED dell\'abbonamento attivo → riporta al piano gratuito', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '789',
    });
    (prisma.plan.findFirst as any).mockResolvedValue({
      planName: 'free',
      priceMonthly: 0,
    });
    (prisma.billingCharge.updateMany as any).mockResolvedValue({});

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/789',
        name: 'pro',
        status: 'DECLINED',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).toHaveBeenCalled();
  });

  it('FROZEN dell\'abbonamento attivo → riporta al piano gratuito', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '321',
    });
    (prisma.plan.findFirst as any).mockResolvedValue({
      planName: 'free',
      priceMonthly: 0,
    });
    (prisma.billingCharge.updateMany as any).mockResolvedValue({});

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/321',
        name: 'pro',
        status: 'FROZEN',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).toHaveBeenCalled();
  });

  it('nessun piano gratuito configurato → logga e ignora', async () => {
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      activeChargeId: '555',
    });
    (prisma.plan.findFirst as any).mockResolvedValue(null);

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/555',
        name: 'pro',
        status: 'CANCELLED',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
    expect(applyPlanToShop).not.toHaveBeenCalled();
  });

  it('errore durante il processing → 200 comunque', async () => {
    (prisma.shop.findUnique as any).mockRejectedValue(
      new Error('Database error'),
    );

    const payload = {
      app_subscription: {
        admin_graphql_api_id: 'gid://shopify/AppSubscription/123',
        name: 'pro',
        status: 'ACTIVE',
      },
    };

    const res = await action({ request: req(payload) } as any);

    expect(res.status).toBe(200);
  });
});

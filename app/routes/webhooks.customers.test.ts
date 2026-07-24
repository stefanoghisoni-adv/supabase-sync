import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/webhooks/verify.server', () => ({ verifyWebhook: () => true }));
vi.mock('~/lib/transformers/customer.server', () => ({
  transformCustomer: vi.fn((c: any) => ({
    shopify_customer_id: c.id,
    email: c.email,
    first_name: c.first_name,
    accepts_marketing: c.email_marketing_consent?.state === 'subscribed',
  })),
}));
vi.mock('~/lib/supabase.server', () => ({ createSupabaseClient: vi.fn() }));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    syncJob: { create: vi.fn() },
  },
}));

import { action } from './webhooks.customers.create';
import { createSupabaseClient } from '~/lib/supabase.server';
import { prisma } from '~/db.server';

function req(body: object) {
  return new Request('https://app/webhooks/customers/create', {
    method: 'POST',
    headers: {
      'X-Shopify-Hmac-Sha256': 'sig',
      'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
    },
    body: JSON.stringify(body),
  });
}

describe('webhook customers/create — consenso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.shop.findUnique as any).mockResolvedValue({
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      currentPlan: 'pro',
      supabaseConfig: {
        syncEnabled: true,
        tableNameCustomers: 'customers',
      },
    });
    (prisma.plan.findUnique as any).mockResolvedValue({
      planName: 'pro',
      customersSyncEnabled: true,
    });
    (prisma.syncJob.create as any).mockResolvedValue({});
  });

  it('cliente subscribed → chiama upsert, non update', async () => {
    const upserted: any[] = [];
    let updateCalled = false;
    (createSupabaseClient as any).mockReturnValue({
      from: () => ({
        upsert: async (rows: any) => {
          upserted.push(rows);
          return { error: null };
        },
        update: () => {
          updateCalled = true;
          return { eq: async () => ({ error: null }) };
        },
      }),
    });

    const res = await action({
      request: req({
        id: 1,
        email: 'opt-in@example.com',
        first_name: 'Alice',
        email_marketing_consent: { state: 'subscribed' },
      }),
    } as any);

    expect(upserted).toHaveLength(1);
    expect(upserted[0].shopify_customer_id).toBe(1);
    expect(updateCalled).toBe(false);
    expect(res.status).toBe(200);
  });

  it('cliente unsubscribed → chiama update con accepts_marketing=false, non upsert', async () => {
    let upsertCalled = false;
    const updates: Array<{ payload: any; id: any }> = [];
    (createSupabaseClient as any).mockReturnValue({
      from: () => ({
        upsert: async () => {
          upsertCalled = true;
          return { error: null };
        },
        update: (payload: any) => ({
          eq: async (_col: string, id: any) => {
            updates.push({ payload, id });
            return { error: null };
          },
        }),
      }),
    });

    const res = await action({
      request: req({
        id: 2,
        email: 'opt-out@example.com',
        first_name: 'Bob',
        email_marketing_consent: { state: 'unsubscribed' },
      }),
    } as any);

    expect(upsertCalled).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ accepts_marketing: false });
    expect(updates[0].id).toBe(2);
    expect(res.status).toBe(200);
  });

  it('entrambi i casi restituiscono 200', async () => {
    (createSupabaseClient as any).mockReturnValue({
      from: () => ({
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    });

    const res1 = await action({
      request: req({
        id: 1,
        email_marketing_consent: { state: 'subscribed' },
      }),
    } as any);
    expect(res1.status).toBe(200);

    const res2 = await action({
      request: req({
        id: 2,
        email_marketing_consent: { state: 'unsubscribed' },
      }),
    } as any);
    expect(res2.status).toBe(200);
  });
});

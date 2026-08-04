import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
const findUnique = vi.fn();

vi.mock('~/db.server', () => ({
  prisma: {
    shop: {
      upsert: (...args: unknown[]) => upsert(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

vi.mock('~/utils/crypto.server', () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => v,
}));

const freePlanName = vi.fn(async () => 'Free');
vi.mock('~/lib/billing/find-plan.server', () => ({
  freePlanName: () => freePlanName(),
}));

import { getOrCreateShop, shopCreateData } from './shop.server';

describe('shopCreateData', () => {
  it('costruisce i dati di creazione dalla sessione', async () => {
    const data = await shopCreateData({ shop: 'x.myshopify.com', accessToken: 'tok', scope: 'read_products' });
    expect(data.shopDomain).toBe('x.myshopify.com');
    expect(data.accessToken).toBe('enc(tok)');
    expect(data.scopes).toBe('read_products');
    expect(data.isInTrial).toBe(true);
    expect(data.trialEndsAt).toBeInstanceOf(Date);
  });

  it('il piano iniziale viene dal listino, non da un nome scritto qui', async () => {
    // Se il piano gratuito si chiamasse "Gratuito", un negozio nuovo deve
    // atterrare li': un nome fisso nel codice sopravvivrebbe al rinomina e la
    // foreign key su current_plan lo rifiuterebbe.
    freePlanName.mockResolvedValueOnce('Gratuito');
    const data = await shopCreateData({ shop: 'x.myshopify.com', accessToken: 'tok' });
    expect(data.currentPlan).toBe('Gratuito');
  });

  it('non fallisce se accessToken/scope sono assenti', async () => {
    const data = await shopCreateData({ shop: 'y.myshopify.com' });
    expect(data.accessToken).toBe('enc()');
    expect(data.scopes).toBe('');
  });
});

describe('getOrCreateShop (self-heal)', () => {
  beforeEach(() => {
    upsert.mockReset();
    findUnique.mockReset();
  });

  it('shop esistente: una sola SELECT, nessuna scrittura', async () => {
    const existing = { id: 's1', shopDomain: 'x.myshopify.com', supabaseConfig: null };
    findUnique.mockResolvedValueOnce(existing);

    const shop = await getOrCreateShop({ shop: 'x.myshopify.com', accessToken: 'tok' });

    expect(shop).toEqual(existing);
    // Il percorso caldo (ogni apertura della dashboard) non deve costare
    // una write transaction sul primario.
    expect(upsert).not.toHaveBeenCalled();
    const arg = findUnique.mock.calls[0][0] as { where: unknown; include: unknown };
    expect(arg.where).toEqual({ shopDomain: 'x.myshopify.com' });
    expect(arg.include).toEqual({ supabaseConfig: true });
  });

  it('esegue un upsert per la sessione e ritorna lo shop (creandolo se manca)', async () => {
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({ id: 's1', shopDomain: 'x.myshopify.com', supabaseConfig: null });
    const shop = await getOrCreateShop({
      shop: 'x.myshopify.com',
      accessToken: 'tok',
      scope: 'read_products',
    });
    expect(shop).toEqual({ id: 's1', shopDomain: 'x.myshopify.com', supabaseConfig: null });
    const arg = upsert.mock.calls[0][0] as {
      where: unknown;
      create: { shopDomain: string; accessToken: string };
      update: unknown;
      include: unknown;
    };
    expect(arg.where).toEqual({ shopDomain: 'x.myshopify.com' });
    expect(arg.create.shopDomain).toBe('x.myshopify.com');
    expect(arg.create.accessToken).toBe('enc(tok)');
    expect(arg.update).toEqual({});
    expect(arg.include).toEqual({ supabaseConfig: true });
  });
});

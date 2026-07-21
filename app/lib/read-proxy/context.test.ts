import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const planFindUnique = vi.fn();
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => findUnique(...a) },
    plan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
  },
}));
vi.mock('~/utils/crypto.server', () => ({ decrypt: (v: string) => v.replace(/^enc\(|\)$/g, '') }));

import { resolveShopReadContext, clearReadContextCache } from './context.server';

const shopRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  authorization: 'ENABLED',
  currentPlan: 'free',
  supabaseConfig: {
    supabaseProjectRef: 'abcref',
    supabaseServiceRoleKey: 'enc(svc)',
  },
  ...over,
});

describe('resolveShopReadContext', () => {
  beforeEach(() => {
    findUnique.mockReset();
    planFindUnique.mockReset();
    clearReadContextCache();
  });

  it('token sconosciuto → kind unknown', async () => {
    findUnique.mockResolvedValueOnce(null);
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({ kind: 'unknown' });
  });

  it('shop senza config → not_configured', async () => {
    findUnique.mockResolvedValueOnce(shopRow({ supabaseConfig: null }));
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({ kind: 'not_configured' });
  });

  it('ok → ctx con service_role decifrata e customersEnabled dal piano', async () => {
    findUnique.mockResolvedValueOnce(shopRow());
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: true });
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({
      kind: 'ok',
      ctx: {
        shopId: 's1',
        authorization: 'ENABLED',
        canReadData: true,
        projectRef: 'abcref',
        serviceRoleKey: 'svc',
        customersEnabled: true,
      },
    });
  });

  // Il gate deve fallire CHIUSO: `authorization` è testo libero editato a mano
  // dall'owner, senza CHECK constraint. Un refuso non deve concedere accesso.
  it.each([
    ['DISABLED', false],
    ['PENDING', false],
    ['disabled', false],
    ['  ENABLED  ', true],
    ['enabled', true],
    ['DISABLD', false],
    ['BANNED', false],
    ['SUSPENDED', false],
    ['', false],
    [null, false],
  ])('authorization %j → canReadData %s', async (value, expected) => {
    findUnique.mockResolvedValueOnce(shopRow({ authorization: value }));
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: false });
    const r = await resolveShopReadContext(`spx_${String(value)}`);
    expect(r.kind).toBe('ok');
    expect((r as { ctx: { canReadData: boolean } }).ctx.canReadData).toBe(expected);
  });

  it('usa la cache entro il TTL (una sola query per token)', async () => {
    findUnique.mockResolvedValue(shopRow());
    planFindUnique.mockResolvedValue({ customersSyncEnabled: false });
    await resolveShopReadContext('spx_same');
    await resolveShopReadContext('spx_same');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

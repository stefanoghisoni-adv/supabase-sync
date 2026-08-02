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
  trackingAuthorization: 'ENABLED',
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
        trackingAuthorization: 'ENABLED',
        canReadData: true,
        projectRef: 'abcref',
        serviceRoleKey: 'svc',
        customersEnabled: true,
      },
    });
  });

  // Il gate deve fallire CHIUSO: la colonna è editata a mano dall'owner, e un
  // refuso non deve concedere accesso.
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
  ])('trackingAuthorization %j → canReadData %s', async (value, expected) => {
    findUnique.mockResolvedValueOnce(shopRow({ trackingAuthorization: value }));
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: false });
    const r = await resolveShopReadContext(`spx_${String(value)}`);
    expect(r.kind).toBe('ok');
    expect((r as { ctx: { canReadData: boolean } }).ctx.canReadData).toBe(expected);
  });

  // Il senso dello sdoppiamento: chi ha l'app sospesa puo' continuare a
  // tracciare con i dati gia' sincronizzati, e chi ha l'app attiva puo' avere
  // il solo tracciamento fermo.
  it('app sospesa ma tracciamento attivo → le letture passano', async () => {
    findUnique.mockResolvedValueOnce(
      shopRow({ authorization: 'DISABLED', trackingAuthorization: 'ENABLED' }),
    );
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: false });
    const r = await resolveShopReadContext('spx_app_off');
    expect((r as { ctx: { canReadData: boolean } }).ctx.canReadData).toBe(true);
  });

  it('app attiva ma tracciamento sospeso → le letture no', async () => {
    findUnique.mockResolvedValueOnce(
      shopRow({ authorization: 'ENABLED', trackingAuthorization: 'DISABLED' }),
    );
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: false });
    const r = await resolveShopReadContext('spx_track_off');
    expect((r as { ctx: { canReadData: boolean } }).ctx.canReadData).toBe(false);
  });

  it('usa la cache entro il TTL (una sola query per token)', async () => {
    findUnique.mockResolvedValue(shopRow());
    planFindUnique.mockResolvedValue({ customersSyncEnabled: false });
    await resolveShopReadContext('spx_same');
    await resolveShopReadContext('spx_same');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  // I token sconosciuti sono l'unico esito che un chiamante ostile può
  // generare a volontà: cacharli gli lascerebbe far crescere la Map.
  it('non mette in cache i token sconosciuti', async () => {
    findUnique.mockResolvedValue(null);
    await resolveShopReadContext('spx_ignoto');
    await resolveShopReadContext('spx_ignoto');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

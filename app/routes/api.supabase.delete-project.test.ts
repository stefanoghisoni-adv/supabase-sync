import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueShop = vi.fn();
const listProjects = vi.fn();
const deleteProject = vi.fn();

vi.mock('~/shopify.server', () => ({
  authenticate: { admin: async () => ({ session: { shop: 'test-shop.myshopify.com' } }) },
}));
vi.mock('~/db.server', () => ({
  prisma: { shop: { findUnique: (...a: unknown[]) => findUniqueShop(...a) } },
}));
vi.mock('~/lib/supabase-oauth.server', () => ({
  getValidAccessToken: async () => 'token',
}));
vi.mock('~/lib/supabase-management.server', () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
}));

import { action } from './api.supabase.delete-project';

const SHOP = {
  id: 'shop-1',
  shopDomain: 'test-shop.myshopify.com',
  authorization: 'ENABLED',
  locale: 'it',
  detectedLocale: null,
  supabaseConfig: { supabaseProjectRef: 'collegato' },
};

function call(ref: unknown, method = 'POST') {
  const request = new Request('https://app.example.com/api/supabase/delete-project', {
    method,
    body: method === 'POST' ? JSON.stringify({ ref }) : undefined,
    headers: { 'Content-Type': 'application/json' },
  });
  return action({ request, params: {}, context: {} } as never);
}

describe('/api/supabase/delete-project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueShop.mockResolvedValue({ ...SHOP });
    listProjects.mockResolvedValue([
      { id: 'collegato', name: 'In uso' },
      { id: 'altro', name: 'Vecchio' },
    ]);
    deleteProject.mockResolvedValue(undefined);
  });

  it('elimina un database che non e in uso', async () => {
    const res = await call('altro');

    expect(await res.json()).toEqual({ ok: true });
    expect(deleteProject).toHaveBeenCalledWith('token', 'altro');
  });

  it('il database collegato non si elimina da qui', async () => {
    // E' quello su cui l'app sta scrivendo: cancellarlo porterebbe via i dati
    // sincronizzati, e da li' non si torna indietro. Prima lo si scollega.
    const res = await call('collegato');

    expect(res.status).toBe(400);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('un progetto che non e suo non si tocca', async () => {
    // Il ref arriva dal browser: che appartenga a questo account lo dice
    // Supabase, non la richiesta.
    const res = await call('di-qualcun-altro');

    expect(res.status).toBe(404);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('a negozio sospeso non si elimina niente', async () => {
    findUniqueShop.mockResolvedValue({ ...SHOP, authorization: 'DISABLED' });

    const res = await call('altro');

    expect(res.status).toBe(403);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('senza ref non si fa niente', async () => {
    const res = await call('');

    expect(res.status).toBe(400);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('metodo diverso da POST → 405', async () => {
    const res = await call('altro', 'GET');

    expect(res.status).toBe(405);
    expect(deleteProject).not.toHaveBeenCalled();
  });
});

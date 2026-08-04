import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueShop = vi.fn();
const findUniqueToken = vi.fn();

vi.mock('~/shopify.server', () => ({
  authenticate: { admin: async () => ({ session: { shop: 'test-shop.myshopify.com' } }) },
}));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => findUniqueShop(...a) },
    supabaseOAuthToken: { findUnique: (...a: unknown[]) => findUniqueToken(...a) },
  },
}));

import { loader } from './api.supabase.link-status';

function call() {
  return loader({
    request: new Request('https://app/api/supabase/link-status'),
  } as never);
}

describe('GET /api/supabase/link-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueShop.mockResolvedValue({ id: 'shop-1' });
  });

  it('accesso a Supabase fatto → linked true', async () => {
    findUniqueToken.mockResolvedValue({ shopId: 'shop-1' });

    const res = await call();

    expect(await res.json()).toEqual({ linked: true });
  });

  it('nessun accesso → linked false', async () => {
    findUniqueToken.mockResolvedValue(null);

    expect(await (await call()).json()).toEqual({ linked: false });
  });

  it('negozio sconosciuto → linked false, senza cercare il token', async () => {
    // Il pannello interroga questa rotta a ripetizione mentre il merchant e' su
    // Supabase: qui non si lancia, si risponde "non ancora".
    findUniqueShop.mockResolvedValue(null);

    expect(await (await call()).json()).toEqual({ linked: false });
    expect(findUniqueToken).not.toHaveBeenCalled();
  });

  it('legge solo se il token esiste, non il token', async () => {
    // I token stanno cifrati e non devono uscire da qui nemmeno per sbaglio:
    // la query seleziona il solo shopId.
    findUniqueToken.mockResolvedValue({ shopId: 'shop-1' });
    await call();

    const arg = findUniqueToken.mock.calls[0][0] as { select: unknown };
    expect(arg.select).toEqual({ shopId: true });
  });
});

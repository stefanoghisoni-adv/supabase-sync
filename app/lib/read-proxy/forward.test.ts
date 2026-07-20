import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowedReadTables, buildSupabaseReadUrl, forwardRead } from './forward.server';

describe('allowedReadTables', () => {
  it('solo products senza clienti; products+customers con clienti', () => {
    expect(allowedReadTables(false)).toEqual(['products']);
    expect(allowedReadTables(true)).toEqual(['products', 'customers']);
  });
});

describe('buildSupabaseReadUrl', () => {
  it('host dal ref, querystring preservata', () => {
    expect(buildSupabaseReadUrl('abcref', 'products', '?sku=eq.X')).toBe(
      'https://abcref.supabase.co/rest/v1/products?sku=eq.X',
    );
  });
  it('nessuna querystring quando vuota o "?"', () => {
    expect(buildSupabaseReadUrl('abcref', 'products', '')).toBe(
      'https://abcref.supabase.co/rest/v1/products',
    );
    expect(buildSupabaseReadUrl('abcref', 'products', '?')).toBe(
      'https://abcref.supabase.co/rest/v1/products',
    );
  });
});

describe('forwardRead', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  const ctx = {
    shopId: 's1', authorization: 'ENABLED' as const, projectRef: 'abcref',
    serviceRoleKey: 'svc', customersEnabled: true,
  };

  it('inoltra con service_role e propaga status/body/content-type', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      status: 200,
      text: async () => '[{"id":1}]',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    });
    const r = await forwardRead(ctx, 'products', '?sku=eq.X');
    expect(r).toEqual({ status: 200, body: '[{"id":1}]', contentType: 'application/json' });
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://abcref.supabase.co/rest/v1/products?sku=eq.X');
    expect(init.method).toBe('GET');
    expect(init.headers.apikey).toBe('svc');
    expect(init.headers.Authorization).toBe('Bearer svc');
  });
});

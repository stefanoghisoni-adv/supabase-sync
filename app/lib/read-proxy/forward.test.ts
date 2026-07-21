import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  allowedReadTables,
  buildSupabaseReadUrl,
  forwardRead,
  selectEmbedsForbiddenTable,
} from './forward.server';

describe('allowedReadTables', () => {
  it('solo products senza clienti; products+customers con clienti', () => {
    expect(allowedReadTables(false)).toEqual(['products']);
    expect(allowedReadTables(true)).toEqual(['products', 'customers']);
  });
});

describe('selectEmbedsForbiddenTable', () => {
  const noCustomers = ['products'];
  const withCustomers = ['products', 'customers'];

  it('nessun select → consentito', () => {
    expect(selectEmbedsForbiddenTable('', noCustomers)).toBe(false);
    expect(selectEmbedsForbiddenTable('?sku=eq.X', noCustomers)).toBe(false);
  });

  it('select semplice → consentito', () => {
    expect(selectEmbedsForbiddenTable('?select=*', noCustomers)).toBe(false);
    expect(selectEmbedsForbiddenTable('?select=sku,price', noCustomers)).toBe(false);
  });

  it('embedding di una tabella gestita ma esclusa dal piano → bloccato', () => {
    expect(selectEmbedsForbiddenTable('?select=*,customers(*)', noCustomers)).toBe(true);
    expect(selectEmbedsForbiddenTable('?select=sku,customers(email)', noCustomers)).toBe(true);
    expect(selectEmbedsForbiddenTable('?select=*,customers!inner(email)', noCustomers)).toBe(true);
    expect(selectEmbedsForbiddenTable('?select=*,alias:customers(*)', noCustomers)).toBe(true);
  });

  it('la stessa embedding è consentita quando il piano include i clienti', () => {
    expect(selectEmbedsForbiddenTable('?select=*,customers(*)', withCustomers)).toBe(false);
  });

  it('gli aggregati PostgREST non sono scambiati per embedding', () => {
    expect(selectEmbedsForbiddenTable('?select=count()', noCustomers)).toBe(false);
    expect(selectEmbedsForbiddenTable('?select=price.sum()', noCustomers)).toBe(false);
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

  it('input validi (abcref, products) non lanciano', () => {
    expect(() => buildSupabaseReadUrl('abcref', 'products', '')).not.toThrow();
    expect(() => buildSupabaseReadUrl('abc123', 'customers', '')).not.toThrow();
  });

  it('table malevolo lancia', () => {
    expect(() => buildSupabaseReadUrl('abcref', 'products/../x', '')).toThrow('Nome tabella non valido');
    expect(() => buildSupabaseReadUrl('abcref', 'products@evil', '')).toThrow('Nome tabella non valido');
    expect(() => buildSupabaseReadUrl('abcref', 'Products', '')).toThrow('Nome tabella non valido');
    expect(() => buildSupabaseReadUrl('abcref', 'prod-ucts', '')).toThrow('Nome tabella non valido');
  });

  it('projectRef malevolo lancia', () => {
    expect(() => buildSupabaseReadUrl('evil.com', 'products', '')).toThrow('Project ref non valido');
    expect(() => buildSupabaseReadUrl('ref/../x', 'products', '')).toThrow('Project ref non valido');
    expect(() => buildSupabaseReadUrl('ref@evil', 'products', '')).toThrow('Project ref non valido');
    expect(() => buildSupabaseReadUrl('ref:8080', 'products', '')).toThrow('Project ref non valido');
  });
});

describe('forwardRead', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  const ctx = {
    shopId: 's1', authorization: 'ENABLED' as const, canReadData: true, projectRef: 'abcref',
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

  it('propaga status non-200 invariato', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      status: 403,
      text: async () => '{"error":"x"}',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    });
    const r = await forwardRead(ctx, 'products', '');
    expect(r).toEqual({ status: 403, body: '{"error":"x"}', contentType: 'application/json' });
  });
});

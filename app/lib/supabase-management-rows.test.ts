import { describe, it, expect, vi, afterEach } from 'vitest';
import { runQueryRows } from './supabase-management.server';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('runQueryRows', () => {
  it('restituisce le righe della SELECT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ table_name: 'products' }, { table_name: 'customers' }],
    }) as unknown as typeof fetch;

    const rows = await runQueryRows<{ table_name: string }>('tok', 'ref123', 'SELECT 1;');
    expect(rows.map((r) => r.table_name)).toEqual(['products', 'customers']);
  });

  it('risposta non-array → lista vuota', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'nope' }),
    }) as unknown as typeof fetch;

    expect(await runQueryRows('tok', 'ref123', 'SELECT 1;')).toEqual([]);
  });

  it('errore HTTP → eccezione', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(runQueryRows('tok', 'ref123', 'SELECT 1;')).rejects.toThrow('500');
  });
});

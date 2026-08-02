import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/utils/crypto.server', () => ({
  decrypt: (value: string) => `decrypted_${value}`,
}));

vi.mock('~/lib/supabase-oauth.server', () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock('~/lib/supabase-management.server', () => ({
  runQuery: vi.fn(),
}));

import { ensureProductsTable } from './ensure-products-table.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { runQuery } from '~/lib/supabase-management.server';

const CONFIG = {
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  supabaseServiceRoleKey: 'enc-service-key',
  supabaseProjectRef: 'abcdefghijklmnopqrst',
  tableNameProducts: 'products',
};

interface ProbeResult {
  data?: unknown[] | null;
  error: unknown;
}

// Client Supabase ridotto a cio' che serve: from().select().limit().
// Ogni chiamata consuma un esito; l'ultimo resta valido per le successive.
function supabaseProbing(...results: ProbeResult[]): any {
  const queue = [...results];
  const selectCalls: unknown[][] = [];
  return {
    selectCalls,
    from: () => ({
      select: (...selectArgs: unknown[]) => {
        selectCalls.push(selectArgs);
        return {
          limit: async () => (queue.length > 1 ? queue.shift()! : queue[0]),
        };
      },
    }),
  };
}

const CACHE_MISS = {
  error: {
    code: 'PGRST205',
    message: "Could not find the table 'public.products' in the schema cache",
  },
};
const MISSING = { error: { code: '42P01', message: 'relation "products" does not exist' } };

describe('ensureProductsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('tabella presente → nessuna DDL', async () => {
    const result = await ensureProductsTable(
      'shop-1',
      CONFIG,
      supabaseProbing({ data: [{ shopify_variant_id: 1 }], error: null }),
    );

    expect(result).toEqual({ status: 'already_present', empty: false });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('"schema cache" → crea la tabella e forza la ricarica dello schema', async () => {
    // E' il guasto vero: tabella creata al collegamento, sync avviata subito
    // dopo, API REST che non la vede ancora.
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureProductsTable(
      'shop-1',
      CONFIG,
      supabaseProbing(CACHE_MISS, { data: [], error: null }),
    );

    expect(result).toEqual({ status: 'created', empty: true });

    const sql = vi.mocked(runQuery).mock.calls[0][2];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('la verifica legge una riga vera della tabella prodotti', async () => {
    const supabase = supabaseProbing({ data: [], error: null });
    await ensureProductsTable('shop-1', CONFIG, supabase);

    expect(supabase.selectCalls[0]).toEqual(['shopify_variant_id']);
  });

  it('senza collegamento OAuth ricade sulla service role key', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('Supabase non collegato'));
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const result = await ensureProductsTable(
      'shop-1',
      CONFIG,
      supabaseProbing(MISSING, { data: [], error: null }),
    );

    expect(result.status).toBe('created');
    expect(fetch).toHaveBeenCalledWith(
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/exec_sql',
      expect.anything(),
    );
  });

  it('creazione non riuscita → unavailable', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('token scaduto'));
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await ensureProductsTable('shop-1', CONFIG, supabaseProbing(MISSING));

    expect(result.status).toBe('unavailable');
  });

  it('nome tabella fuori standard → non proviamo a crearla', async () => {
    const result = await ensureProductsTable(
      'shop-1',
      { ...CONFIG, tableNameProducts: 'prodotti_miei' },
      supabaseProbing(MISSING),
    );

    expect(result.status).toBe('unavailable');
    expect(runQuery).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

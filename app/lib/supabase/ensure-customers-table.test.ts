import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({
  prisma: { syncJob: { create: vi.fn(async () => ({ id: 'job-1' })) } },
}));

vi.mock('~/utils/crypto.server', () => ({
  decrypt: (value: string) => `decrypted_${value}`,
}));

vi.mock('~/lib/supabase-oauth.server', () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock('~/lib/supabase-management.server', () => ({
  runQuery: vi.fn(),
}));

import { ensureCustomersTable } from './ensure-customers-table.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { runQuery } from '~/lib/supabase-management.server';
import { prisma } from '~/db.server';

const CONFIG = {
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  supabaseServiceRoleKey: 'enc-service-key',
  supabaseProjectRef: 'abcdefghijklmnopqrst',
  tableNameCustomers: 'customers',
};

interface ProbeResult {
  data?: unknown[] | null;
  error: unknown;
}

interface FakeSupabase {
  from: (table: string) => unknown;
  /** Argomenti di ogni select(), per verificare come viene interrogata la tabella. */
  selectCalls: unknown[][];
  /** Argomenti di ogni limit(). */
  limitCalls: unknown[][];
}

// Client Supabase ridotto a cio' che serve: from().select().limit().
// Ogni chiamata consuma un esito; l'ultimo resta valido per le successive.
function supabaseProbing(...results: ProbeResult[]): FakeSupabase & any {
  const queue = [...results];
  const selectCalls: unknown[][] = [];
  const limitCalls: unknown[][] = [];
  return {
    selectCalls,
    limitCalls,
    from: () => ({
      select: (...selectArgs: unknown[]) => {
        selectCalls.push(selectArgs);
        return {
          limit: async (...limitArgs: unknown[]) => {
            limitCalls.push(limitArgs);
            return queue.length > 1 ? queue.shift()! : queue[0];
          },
        };
      },
    }),
  } as any;
}

const MISSING = { error: { code: '42P01', message: 'relation "customers" does not exist' } };
const CACHE_MISS = {
  error: { code: 'PGRST205', message: "Could not find the table 'public.customers' in the schema cache" },
};

describe('ensureCustomersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('tabella presente e popolata → nessuna DDL, sync incrementale', async () => {
    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing({ data: [{ shopify_customer_id: 1 }], error: null }),
    );

    expect(result).toEqual({ status: 'already_present', empty: false });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('la verifica legge davvero una riga, non un conteggio a vuoto', async () => {
    // Regressione: con una richiesta senza corpo (head+count) l'API REST risponde
    // alla tabella mancante con un 404 vuoto, che il client non riporta come
    // errore. La tabella inesistente passerebbe per presente e non verrebbe mai
    // creata — che e' esattamente il guasto da cui nasce questo controllo.
    const supabase = supabaseProbing({ data: [], error: null });
    await ensureCustomersTable('shop-1', CONFIG, supabase);

    expect(supabase.selectCalls).toHaveLength(1);
    expect(supabase.selectCalls[0]).toEqual(['shopify_customer_id']);
    expect(supabase.limitCalls[0]).toEqual([1]);
  });

  it('tabella presente ma vuota → recupero completo', async () => {
    // Creata in una corsa precedente e mai popolata: il delta la lascerebbe vuota.
    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing({ data: [], error: null }),
    );

    expect(result).toEqual({ status: 'already_present', empty: true });
  });

  it('tabella mancante → la crea, ricarica lo schema e lo registra nei log', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing(MISSING, { data: [], error: null }),
    );

    expect(result).toEqual({ status: 'created', empty: true });

    const sql = vi.mocked(runQuery).mock.calls[0][2];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS products');
    // Senza il reload, l'API REST continuerebbe a rispondere "schema cache".
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");

    expect(prisma.syncJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobType: 'table_create_customers' }),
      }),
    );
  });

  it('"schema cache" viene trattato come tabella da creare', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing(CACHE_MISS, { data: [], error: null }),
    );

    expect(result.status).toBe('created');
  });

  it('senza collegamento OAuth ricade sulla service role key', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('Supabase non collegato'));
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const result = await ensureCustomersTable(
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

  it('se la creazione non riesce → unavailable, non un errore', async () => {
    // Il chiamante deve poter saltare i clienti e portare a termine i prodotti.
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('token scaduto'));
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing(MISSING),
    );

    expect(result.status).toBe('unavailable');
  });

  it('nome tabella fuori standard → non proviamo a crearla', async () => {
    const result = await ensureCustomersTable(
      'shop-1',
      { ...CONFIG, tableNameCustomers: 'clienti_miei' },
      supabaseProbing(MISSING),
    );

    expect(result.status).toBe('unavailable');
    expect(runQuery).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('errore di lettura diverso da "tabella assente" → DDL idempotente comunque', async () => {
    // Non sapendo se la tabella c'e', la scelta sicura e' la DDL (che non
    // distrugge nulla) e un recupero completo dei clienti.
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing({ error: { code: 'PGRST301', message: 'JWT expired' } }, { data: [], error: null }),
    );

    expect(result.status).toBe('created');
  });
});

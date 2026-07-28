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
  count?: number | null;
  error: unknown;
}

// Client Supabase ridotto a cio' che serve: from().select() con head+count.
// Ogni chiamata consuma un esito; l'ultimo resta valido per le successive.
function supabaseProbing(...results: ProbeResult[]) {
  const queue = [...results];
  return {
    from: () => ({
      select: async () => (queue.length > 1 ? queue.shift()! : queue[0]),
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
      supabaseProbing({ count: 12, error: null }),
    );

    expect(result).toEqual({ status: 'already_present', empty: false });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('tabella presente ma vuota → recupero completo', async () => {
    // Creata in una corsa precedente e mai popolata: il delta la lascerebbe vuota.
    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing({ count: 0, error: null }),
    );

    expect(result).toEqual({ status: 'already_present', empty: true });
  });

  it('tabella mancante → la crea, ricarica lo schema e lo registra nei log', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing(MISSING, { count: 0, error: null }),
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
      supabaseProbing(CACHE_MISS, { count: 0, error: null }),
    );

    expect(result.status).toBe('created');
  });

  it('senza collegamento OAuth ricade sulla service role key', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('Supabase non collegato'));
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseProbing(MISSING, { count: 0, error: null }),
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
      supabaseProbing({ error: { code: 'PGRST301', message: 'JWT expired' } }, { count: 0, error: null }),
    );

    expect(result.status).toBe('created');
  });
});

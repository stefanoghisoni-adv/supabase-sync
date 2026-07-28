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

// Client Supabase ridotto a cio' che serve alla verifica: from().select().limit()
function supabaseReturning(error: unknown) {
  return {
    from: () => ({ select: () => ({ limit: () => ({ error }) }) }),
  } as any;
}

const MISSING_TABLE = { code: '42P01', message: 'relation "customers" does not exist' };

describe('ensureCustomersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('tabella presente → nessuna DDL', async () => {
    const result = await ensureCustomersTable('shop-1', CONFIG, supabaseReturning(null));

    expect(result).toBe('already_present');
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('tabella mancante → la crea e lo registra nei log', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseReturning(MISSING_TABLE),
    );

    expect(result).toBe('created');
    // La DDL applicata e' quella dei clienti, e solo quella.
    const sql = vi.mocked(runQuery).mock.calls[0][2];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS products');
    expect(prisma.syncJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobType: 'table_create_customers' }),
      }),
    );
  });

  it('senza collegamento OAuth ricade sulla service role key', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('Supabase non collegato'));
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseReturning(MISSING_TABLE),
    );

    expect(result).toBe('created');
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
      supabaseReturning(MISSING_TABLE),
    );

    expect(result).toBe('unavailable');
  });

  it('nome tabella fuori standard → non proviamo a crearla', async () => {
    const result = await ensureCustomersTable(
      'shop-1',
      { ...CONFIG, tableNameCustomers: 'clienti_miei' },
      supabaseReturning(MISSING_TABLE),
    );

    expect(result).toBe('unavailable');
    expect(runQuery).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('errore di lettura diverso da "tabella assente" → prova comunque la DDL idempotente', async () => {
    // Non sapendo se la tabella c'e', la scelta sicura e' la DDL (che non
    // distrugge nulla) e un recupero completo dei clienti.
    vi.mocked(getValidAccessToken).mockResolvedValue('token');

    const result = await ensureCustomersTable(
      'shop-1',
      CONFIG,
      supabaseReturning({ code: 'PGRST301', message: 'JWT expired' }),
    );

    expect(result).toBe('created');
  });
});

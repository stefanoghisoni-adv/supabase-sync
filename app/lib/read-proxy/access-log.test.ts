import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
const deleteMany = vi.fn();

vi.mock('~/db.server', () => ({
  prisma: {
    customerDataAccessLog: {
      create: (...a: unknown[]) => create(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

import {
  logCustomerDataAccess,
  pruneAccessLog,
  accessLogCutoff,
  ACCESS_LOG_RETENTION_DAYS,
} from './access-log.server';

describe('registro degli accessi ai dati personali', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({});
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it('scrive negozio, esito e status', async () => {
    await logCustomerDataAccess({ shopId: 's1', outcome: 'allowed', status: 200 });

    expect(create).toHaveBeenCalledWith({
      data: { shopId: 's1', outcome: 'allowed', status: 200 },
    });
  });

  it('registra anche i tentativi senza negozio', async () => {
    await logCustomerDataAccess({ shopId: null, outcome: 'denied_invalid_token', status: 401 });

    const arg = create.mock.calls[0][0] as { data: { shopId: string | null } };
    expect(arg.data.shopId).toBeNull();
  });

  it('non salva ne i dati letti ne la query', async () => {
    // E' il punto della cosa: una search PostgREST puo' contenere un indirizzo
    // email, e un registro che se la copia diventa lui stesso un archivio di
    // dati personali. Le sole chiavi ammesse sono queste tre.
    await logCustomerDataAccess({ shopId: 's1', outcome: 'allowed', status: 200 });

    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(arg.data).sort()).toEqual(['outcome', 'shopId', 'status']);
  });

  it('un errore di scrittura non si propaga al chiamante', async () => {
    // La lettura e' gia' avvenuta: farla fallire a posteriori non la annulla, e
    // toglierebbe i dati al tracciamento del merchant per un log mancato.
    create.mockRejectedValue(new Error('database irraggiungibile'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logCustomerDataAccess({ shopId: 's1', outcome: 'allowed', status: 200 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('la soglia di conservazione e un anno indietro', () => {
    const now = new Date('2026-08-06T00:00:00.000Z');

    const cutoff = accessLogCutoff(now);

    expect(ACCESS_LOG_RETENTION_DAYS).toBe(365);
    expect(now.getTime() - cutoff.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('la potatura cancella solo cio che precede la soglia', async () => {
    const now = new Date('2026-08-06T00:00:00.000Z');
    deleteMany.mockResolvedValue({ count: 7 });

    const removed = await pruneAccessLog(now);

    expect(removed).toBe(7);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: accessLogCutoff(now) } },
    });
  });

  it('una potatura fallita restituisce zero senza lanciare', async () => {
    deleteMany.mockRejectedValue(new Error('timeout'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(pruneAccessLog()).resolves.toBe(0);
    errorSpy.mockRestore();
  });
});

import { describe, it, expect } from 'vitest';

import { syncIsActive, SYNC_ACTIVE_CONFIG_FILTER } from './sync-active';

describe('syncIsActive', () => {
  it('progetto collegato e verificato → attiva', () => {
    expect(syncIsActive({ connectionVerifiedAt: new Date() })).toBe(true);
  });

  it('collegamento mai verificato → non attiva', () => {
    // Verificare il collegamento e' l'ultimo passo: prima di quello non
    // sappiamo nemmeno se le tabelle rispondono.
    expect(syncIsActive({ connectionVerifiedAt: null })).toBe(false);
  });

  it('nessuna configurazione → non attiva', () => {
    // Lo scollegamento cancella la riga: qui ci si arriva davvero.
    expect(syncIsActive(null)).toBe(false);
    expect(syncIsActive(undefined)).toBe(false);
  });

  it('il filtro Prisma dice la stessa cosa della funzione', () => {
    // Se i due divergono, la coda sincronizza negozi che i processor poi
    // rifiutano — o peggio, il contrario.
    expect(SYNC_ACTIVE_CONFIG_FILTER).toEqual({
      connectionVerifiedAt: { not: null },
    });
  });
});

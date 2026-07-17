import { describe, it, expect } from 'vitest';
import { resolveSyncState } from './sync-state';

const connectedAt = new Date('2026-07-17T10:00:00Z');
const before = new Date('2026-07-17T09:00:00Z');
const after = new Date('2026-07-17T11:00:00Z');

describe('resolveSyncState', () => {
  it('idle senza connessione verificata', () => {
    expect(
      resolveSyncState(
        [{ jobType: 'initial_bulk', status: 'completed', startedAt: after }],
        null,
      ),
    ).toBe('idle');
  });

  it('completed se un bulk è completato DOPO la connessione', () => {
    expect(
      resolveSyncState(
        [{ jobType: 'initial_bulk', status: 'completed', startedAt: after }],
        connectedAt,
      ),
    ).toBe('completed');
  });

  it('in_progress se un bulk è running dopo la connessione', () => {
    expect(
      resolveSyncState(
        [{ jobType: 'initial_bulk', status: 'running', startedAt: after }],
        connectedAt,
      ),
    ).toBe('in_progress');
  });

  it('idle: un bulk completato PRIMA della connessione non conta (riconnessione)', () => {
    expect(
      resolveSyncState(
        [{ jobType: 'initial_bulk', status: 'completed', startedAt: before }],
        connectedAt,
      ),
    ).toBe('idle');
  });

  it('ignora job non initial_bulk', () => {
    expect(
      resolveSyncState(
        [
          { jobType: 'periodic_check', status: 'completed', startedAt: after },
          { jobType: 'initial_bulk', status: 'running', startedAt: after },
        ],
        connectedAt,
      ),
    ).toBe('in_progress');
  });

  it('prende il bulk più recente (lista desc)', () => {
    expect(
      resolveSyncState(
        [
          { jobType: 'initial_bulk', status: 'running', startedAt: after },
          { jobType: 'initial_bulk', status: 'completed', startedAt: connectedAt },
        ],
        connectedAt,
      ),
    ).toBe('in_progress');
  });
});

import { describe, it, expect } from 'vitest';
import { nextSyncAt, formatCountdown } from './next-sync';

const at = (iso: string) => new Date(iso);

describe('nextSyncAt', () => {
  it('somma l intervallo del piano e aspetta il primo passaggio del cron', () => {
    // Scadenza alle 04:00: il cron e' gia' passato quel giorno, quindi tocca al
    // giorno dopo. Dire "fra un'ora" sarebbe stato falso di ventiquattro.
    const next = nextSyncAt(at('2026-08-01T04:00:00Z'), 24, at('2026-08-01T12:00:00Z'));
    expect(next?.toISOString()).toBe('2026-08-03T03:00:00.000Z');
  });

  it('scadenza prima dell ora del cron: passa lo stesso giorno', () => {
    const next = nextSyncAt(at('2026-08-01T01:00:00Z'), 24, at('2026-08-01T12:00:00Z'));
    expect(next?.toISOString()).toBe('2026-08-02T03:00:00.000Z');
  });

  it('gia scaduta: la prende il prossimo passaggio, non una data nel passato', () => {
    const next = nextSyncAt(at('2026-07-01T03:00:00Z'), 24, at('2026-08-05T10:00:00Z'));
    expect(next?.toISOString()).toBe('2026-08-06T03:00:00.000Z');
  });

  it('senza una corsa precedente non si promette niente', () => {
    // Parte al primo giro utile: non c'e' un'attesa da annunciare, e inventarne
    // una sarebbe peggio del silenzio.
    expect(nextSyncAt(null, 24, at('2026-08-05T10:00:00Z'))).toBeNull();
  });

  it('senza intervallo non si promette niente', () => {
    expect(nextSyncAt(at('2026-08-01T03:00:00Z'), null, at('2026-08-05T10:00:00Z'))).toBeNull();
    expect(nextSyncAt(at('2026-08-01T03:00:00Z'), 0, at('2026-08-05T10:00:00Z'))).toBeNull();
  });

  it('regge l intervallo settimanale del piano Free', () => {
    // 168 ore = 7 giorni.
    const next = nextSyncAt(at('2026-08-01T03:00:00Z'), 168, at('2026-08-02T10:00:00Z'));
    expect(next?.toISOString()).toBe('2026-08-09T03:00:00.000Z');
  });
});

describe('formatCountdown', () => {
  it('sceglie una sola unita, la piu grande che abbia senso', () => {
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-08T00:00:00Z'))).toBe('7 giorni');
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-02T00:00:00Z'))).toBe('un giorno');
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-01T05:00:00Z'))).toBe('5 ore');
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-01T01:00:00Z'))).toBe("un'ora");
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-01T00:30:00Z'))).toBe('30 minuti');
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-01T00:01:00Z'))).toBe('un minuto');
  });

  it('niente da dire se e gia passata', () => {
    expect(formatCountdown(at('2026-08-02T00:00:00Z'), at('2026-08-01T00:00:00Z'))).toBeNull();
    expect(formatCountdown(at('2026-08-01T00:00:00Z'), at('2026-08-01T00:00:00Z'))).toBeNull();
  });
});

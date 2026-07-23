import { describe, it, expect } from 'vitest';
import { planLabel, syncFrequencyLabel } from './account-format';

describe('planLabel', () => {
  it('mappa i piani noti', () => {
    expect(planLabel('free')).toBe('Free');
    expect(planLabel('pro')).toBe('Pro+');
    expect(planLabel('business')).toBe('Business');
    expect(planLabel('enterprise')).toBe('Enterprise');
    expect(planLabel('lifetime')).toBe('Lifetime');
  });
  it('tollera maiuscole e spazi', () => {
    expect(planLabel('  PRO ')).toBe('Pro+');
  });
  it('piano sconosciuto → capitalizzato', () => {
    expect(planLabel('custom')).toBe('Custom');
  });
  it('valore assente → trattino', () => {
    expect(planLabel(null)).toBe('—');
    expect(planLabel('')).toBe('—');
  });
});

describe('syncFrequencyLabel', () => {
  it('1 ora', () => expect(syncFrequencyLabel(1)).toBe('Ogni ora'));
  it('24 ore', () => expect(syncFrequencyLabel(24)).toBe('Ogni 24 ore'));
  it('mezz ora → minuti', () => expect(syncFrequencyLabel(0.5)).toBe('Ogni 30 minuti'));
  it('decimale → una cifra', () => expect(syncFrequencyLabel(1.5)).toBe('Ogni 1.5 ore'));
  it('assente o non valido → trattino', () => {
    expect(syncFrequencyLabel(null)).toBe('—');
    expect(syncFrequencyLabel(0)).toBe('—');
  });
});

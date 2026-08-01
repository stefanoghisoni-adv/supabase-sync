import { describe, it, expect } from 'vitest';
import {
  planLabel,
  syncFrequencyLabel,
  syncStatusBadge,
  firstPlanWithCustomersSync,
} from './account-format';

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

describe('syncStatusBadge', () => {
  it('attiva → verde', () => {
    expect(syncStatusBadge(true)).toEqual({ tone: 'success', content: 'Attiva' });
  });
  it('non attiva → grigio, senza tono', () => {
    expect(syncStatusBadge(false)).toEqual({ content: 'Non attiva' });
  });
});

describe('firstPlanWithCustomersSync', () => {
  const plans = [
    { planName: 'free', priceMonthly: 0, customersSyncEnabled: false },
    { planName: 'enterprise', priceMonthly: 99, customersSyncEnabled: true },
    { planName: 'pro', priceMonthly: 19, customersSyncEnabled: true },
    { planName: 'business', priceMonthly: 49, customersSyncEnabled: true },
  ];

  it("propone il piu' economico fra quelli che includono i clienti", () => {
    expect(firstPlanWithCustomersSync(plans, 'free')).toBe('pro');
  });

  it("salta il piano gia' in uso", () => {
    expect(firstPlanWithCustomersSync(plans, 'pro')).toBe('business');
  });

  it('ignora i piani non acquistabili', () => {
    // Lifetime include i clienti e costa 0, ma non ha una pagina di acquisto:
    // proporlo manderebbe il merchant su una tab che per lui non esiste.
    const withLifetime = [
      { planName: 'lifetime', priceMonthly: 0, customersSyncEnabled: true },
      ...plans,
    ];
    expect(firstPlanWithCustomersSync(withLifetime, 'free')).toBe('pro');
  });

  it('nessun piano da proporre → null', () => {
    expect(firstPlanWithCustomersSync([], 'free')).toBeNull();
    expect(
      firstPlanWithCustomersSync(
        [{ planName: 'free', priceMonthly: 0, customersSyncEnabled: false }],
        'free',
      ),
    ).toBeNull();
  });
});

describe('syncFrequencyLabel', () => {
  it('1 ora', () => expect(syncFrequencyLabel(1)).toBe('Ogni ora'));
  it('mezz ora → minuti', () => expect(syncFrequencyLabel(0.5)).toBe('Ogni 30 minuti'));
  it('decimale → una cifra', () => expect(syncFrequencyLabel(1.5)).toBe('Ogni 1.5 ore'));
  it('assente o non valido → trattino', () => {
    expect(syncFrequencyLabel(null)).toBe('—');
    expect(syncFrequencyLabel(0)).toBe('—');
  });
});

describe('syncFrequencyLabel — giorni', () => {
  it('rende i multipli esatti di 24h come giorni', () => {
    expect(syncFrequencyLabel(168)).toBe('Ogni 7 giorni');
    expect(syncFrequencyLabel(24)).toBe('Ogni giorno');
    expect(syncFrequencyLabel(48)).toBe('Ogni 2 giorni');
  });

  it('lascia invariati i casi ore/minuti (e i non-multipli di 24)', () => {
    expect(syncFrequencyLabel(6)).toBe('Ogni 6 ore');
    expect(syncFrequencyLabel(1)).toBe('Ogni ora');
    expect(syncFrequencyLabel(0.5)).toBe('Ogni 30 minuti');
    expect(syncFrequencyLabel(30)).toBe('Ogni 30 ore');
  });
});

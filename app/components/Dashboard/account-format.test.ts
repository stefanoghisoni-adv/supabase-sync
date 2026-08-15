import { describe, it, expect } from 'vitest';
// Alias: `it` e' anche il nome del caso di test in vitest.
import { it as itDict } from '~/lib/i18n/it';
import { en as enDict } from '~/lib/i18n/en';
import {
  planLabel,
  syncFrequencyLabel,
  syncStatusBadge,
  firstPlanWithCustomersSync,
} from './account-format';

describe('planLabel', () => {
  it('mappa i piani noti', () => {
    expect(planLabel('free')).toBe('Free');
    expect(planLabel('pro')).toBe('Pro');
    expect(planLabel('business')).toBe('Business');
    expect(planLabel('enterprise')).toBe('Enterprise');
    expect(planLabel('lifetime')).toBe('Lifetime');
  });
  it('tollera maiuscole e spazi', () => {
    expect(planLabel('  PRO ')).toBe('Pro');
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
  it('attiva → verde, con la parola della lingua in uso', () => {
    expect(syncStatusBadge(true, itDict)).toEqual({ tone: 'success', content: 'Attiva' });
    expect(syncStatusBadge(true, enDict)).toEqual({ tone: 'success', content: 'Active' });
  });
  it('non attiva → grigio, senza tono', () => {
    // Il grigio non e' un errore: e' una funzione che al momento non e' in uso.
    expect(syncStatusBadge(false, itDict)).toEqual({ content: 'Non attiva' });
    expect(syncStatusBadge(false, enDict)).toEqual({ content: 'Not active' });
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
  it('1 ora', () => expect(syncFrequencyLabel(1, itDict)).toBe('Ogni ora'));
  it('mezz ora → minuti', () => expect(syncFrequencyLabel(0.5, itDict)).toBe('Ogni 30 minuti'));
  it('decimale → una cifra', () => expect(syncFrequencyLabel(1.5, itDict)).toBe('Ogni 1.5 ore'));
  it('assente o non valido → trattino', () => {
    expect(syncFrequencyLabel(null, itDict)).toBe('—');
    expect(syncFrequencyLabel(0, itDict)).toBe('—');
  });
});

describe('syncFrequencyLabel — giorni', () => {
  it('rende i multipli esatti di 24h come giorni', () => {
    expect(syncFrequencyLabel(168, itDict)).toBe('Ogni 7 giorni');
    expect(syncFrequencyLabel(24, itDict)).toBe('Ogni giorno');
    expect(syncFrequencyLabel(48, itDict)).toBe('Ogni 2 giorni');
  });

  it('lascia invariati i casi ore/minuti (e i non-multipli di 24)', () => {
    expect(syncFrequencyLabel(6, itDict)).toBe('Ogni 6 ore');
    expect(syncFrequencyLabel(1, itDict)).toBe('Ogni ora');
    expect(syncFrequencyLabel(0.5, itDict)).toBe('Ogni 30 minuti');
    expect(syncFrequencyLabel(30, itDict)).toBe('Ogni 30 ore');
  });
});

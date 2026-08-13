import { describe, it, expect } from 'vitest';
import type { PlanCard } from '~/components/Billing/plan-catalog';
import {
  planChoiceOptions,
  planPriceLabel,
  planSummary,
  preselectedPlan,
} from './plan-step';

function card(overrides: Partial<PlanCard> = {}): PlanCard {
  return {
    name: 'Pro',
    priceMonthly: 29,
    priceYearly: 290,
    partnerMonthly: null,
    partnerYearly: null,
    recommended: true,
    features: [
      { key: 'products', label: 'Fino a 5.000 prodotti', included: true },
      { key: 'sync', label: 'Sync ogni 6 ore', included: true },
      { key: 'email', label: 'Supporto via email', included: true },
      { key: 'customers', label: 'Fino a 10.000 clienti', included: true },
      { key: 'push', label: 'Push manuale', included: false },
      { key: 'chat', label: 'Chat dedicata', included: false },
    ],
    ...overrides,
  };
}

describe('planSummary', () => {
  it('tiene solo cio che distingue un piano dall\'altro', () => {
    // Il supporto via email c'e' su tutti i piani: ripeterlo su ognuno non
    // aiuta a scegliere.
    expect(planSummary(card())).toBe(
      'Fino a 5.000 prodotti · Sync ogni 6 ore · Fino a 10.000 clienti',
    );
  });

  it('non annuncia cio che il piano non include', () => {
    const free = card({
      features: [
        { key: 'products', label: 'Fino a 100 prodotti', included: true },
        { key: 'sync', label: 'Sync ogni 7 giorni', included: true },
        { key: 'customers', label: 'Sync clienti', included: false },
      ],
    });

    expect(planSummary(free)).toBe('Fino a 100 prodotti · Sync ogni 7 giorni');
  });
});

describe('planPriceLabel', () => {
  it('scrive il prezzo al mese', () => {
    expect(planPriceLabel(card(), null)).toBe('€ 29/mese');
  });

  it('a prezzo zero dice "Gratis", non "€ 0"', () => {
    expect(planPriceLabel(card({ priceMonthly: 0 }), null)).toBe('Gratis');
  });

  it('usa il prezzo riservato quando il negozio ne ha uno', () => {
    expect(planPriceLabel(card({ partnerMonthly: 24 }), 3)).toBe('€ 24/mese');
  });
});

describe('planChoiceOptions', () => {
  it('una riga per piano, con nome e prezzo nel titolo', () => {
    const options = planChoiceOptions([card({ name: 'Free', priceMonthly: 0 }), card()], null);

    expect(options.map((o) => o.label)).toEqual(['Free — Gratis', 'Pro — € 29/mese']);
    expect(options[0].value).toBe('Free');
  });
});

describe('preselectedPlan', () => {
  it('sceglie il piano che il negozio ha adesso', () => {
    expect(preselectedPlan([card({ name: 'Free' }), card()], 'free')).toBe('Free');
  });

  it('senza corrispondenza non preseleziona niente', () => {
    // Piani interni assegnati dall'owner: non sono nel listino, e spuntare al
    // loro posto un piano a pagamento farebbe confermare una spesa mai voluta.
    expect(preselectedPlan([card()], 'lifetime')).toBe('');
    expect(preselectedPlan([card()], null)).toBe('');
  });
});

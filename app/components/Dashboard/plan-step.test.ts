import { describe, it, expect } from 'vitest';
import type { PlanCard } from '~/components/Billing/plan-catalog';
import {
  planPriceLabel,
  preselectedPlan,
  recommendedPlan,
  yearlySaving,
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

  it('sull annuale scrive il prezzo dell anno', () => {
    expect(planPriceLabel(card(), null, 'yearly')).toBe('€ 290/anno');
    expect(planPriceLabel(card({ partnerYearly: 240 }), 3, 'yearly')).toBe('€ 240/anno');
  });
});

describe('yearlySaving', () => {
  it('dice il risparmio piu alto fra i piani', () => {
    // 29x12 - 290 = 58 su Pro; 47x12 - 400 = 164 su Business: vince il secondo.
    const saving = yearlySaving([
      card(),
      card({ name: 'Business', priceMonthly: 47, priceYearly: 400 }),
    ]);
    expect(saving).toBe(164);
  });

  it('senza risparmio non annuncia niente', () => {
    // Un listino in cui l'annuale non conviene esiste: annunciarlo lo stesso
    // sarebbe falso.
    expect(yearlySaving([card({ priceMonthly: 10, priceYearly: 120 })])).toBeNull();
    expect(yearlySaving([card({ priceMonthly: 0, priceYearly: 0 })])).toBeNull();
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

describe('recommendedPlan', () => {
  const listino = [
    card({ name: 'Free', priceMonthly: 0 }),
    card({ name: 'Pro', priceMonthly: 27 }),
    card({ name: 'Business', priceMonthly: 47 }),
    card({ name: 'Enterprise', priceMonthly: 97 }),
  ];
  const tetti = { Free: 10, Pro: 200, Business: 1000, Enterprise: 5000 };

  it('consiglia il piu economico che contiene tutto il catalogo', () => {
    expect(recommendedPlan(listino, 8, tetti)).toBe('Free');
    expect(recommendedPlan(listino, 26, tetti)).toBe('Pro');
    expect(recommendedPlan(listino, 900, tetti)).toBe('Business');
  });

  it('sul confine sta il piano che ci arriva esatto', () => {
    expect(recommendedPlan(listino, 10, tetti)).toBe('Free');
    expect(recommendedPlan(listino, 11, tetti)).toBe('Pro');
  });

  it('se nessuno basta consiglia il piu capiente', () => {
    // Tacere lascerebbe senza indicazione proprio il negozio piu' grande.
    expect(recommendedPlan(listino, 99_999, tetti)).toBe('Enterprise');
  });

  it('un piano senza tetto contiene qualunque catalogo', () => {
    expect(recommendedPlan([card({ name: 'Pro', priceMonthly: 27 })], 99_999, { Pro: null })).toBe(
      'Pro',
    );
  });

  it('senza conteggio dei prodotti non consiglia niente', () => {
    // I prodotti arrivano da una richiesta: finche' non ci sono, un consiglio
    // sarebbe basato sul nulla.
    expect(recommendedPlan(listino, null, tetti)).toBeNull();
    expect(recommendedPlan([], 26, tetti)).toBeNull();
  });
});

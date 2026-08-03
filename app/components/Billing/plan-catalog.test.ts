import { describe, it, expect } from 'vitest';
import {
  buildPlanCards,
  buildPlanFeatures,
  formatPrice,
  FEATURE_ORDER,
  type PlanRow,
} from './plan-catalog';

// Il listino come sta nella tabella `plans`.
const row = (over: Partial<PlanRow> = {}): PlanRow => ({
  planName: 'free',
  priceMonthly: 0,
  maxProducts: 50,
  maxCustomers: 0,
  maxSyncFrequencyHours: 168,
  customersSyncEnabled: false,
  supportLevel: 'community',
  ...over,
});

const PLANS: PlanRow[] = [
  row(),
  row({
    planName: 'pro',
    priceMonthly: 29,
    maxProducts: 100,
    maxCustomers: 5000,
    maxSyncFrequencyHours: 96,
    customersSyncEnabled: true,
    supportLevel: 'email',
  }),
  row({
    planName: 'business',
    priceMonthly: 99,
    maxProducts: 400,
    maxCustomers: 50000,
    maxSyncFrequencyHours: 48,
    customersSyncEnabled: true,
    supportLevel: 'priority',
  }),
  row({
    planName: 'enterprise',
    priceMonthly: 299,
    maxProducts: null,
    maxCustomers: null,
    maxSyncFrequencyHours: 24,
    customersSyncEnabled: true,
    supportLevel: 'dedicated',
  }),
  row({
    planName: 'lifetime',
    priceMonthly: 0,
    maxProducts: null,
    maxCustomers: null,
    maxSyncFrequencyHours: 0.5,
    customersSyncEnabled: true,
    supportLevel: 'dedicated',
  }),
];

describe('buildPlanCards', () => {
  it('lifetime non compare: non e’ un piano che si compra', () => {
    expect(buildPlanCards(PLANS).map((p) => p.name)).toEqual([
      'free',
      'pro',
      'business',
      'enterprise',
    ]);
  });

  it('il nome e’ quello scritto nella tabella, senza ritocchi', () => {
    // Se l'owner scrive "Pro Plus " nella colonna, sulla card si legge quello.
    const cards = buildPlanCards([row({ planName: 'Pro Plus ', priceMonthly: 49 })]);
    expect(cards[0].name).toBe('Pro Plus ');
  });

  it('dal piu’ economico al piu’ caro', () => {
    const shuffled = [PLANS[3], PLANS[0], PLANS[2], PLANS[1]];
    expect(buildPlanCards(shuffled).map((p) => p.priceMonthly)).toEqual([0, 29, 99, 299]);
  });

  it('un solo consigliato', () => {
    expect(buildPlanCards(PLANS).filter((p) => p.recommended)).toHaveLength(1);
  });
});

describe('buildPlanFeatures', () => {
  it('stesse righe, nello stesso ordine, per ogni piano', () => {
    for (const plan of buildPlanCards(PLANS)) {
      expect(plan.features.map((f) => f.key)).toEqual([...FEATURE_ORDER]);
    }
  });

  it('i limiti sono quelli della tabella', () => {
    const label = (plan: PlanRow, key: string) =>
      buildPlanFeatures(plan).find((f) => f.key === key)!.label;

    expect(label(row({ maxProducts: 50 }), 'products')).toBe('Fino a 50 prodotti');
    expect(label(row({ maxProducts: 12345 }), 'products')).toBe('Fino a 12.345 prodotti');
    expect(label(row({ maxProducts: null }), 'products')).toBe('Prodotti illimitati');
    expect(label(row({ maxSyncFrequencyHours: 168 }), 'sync')).toBe('Sync ogni 7 giorni');
    expect(label(row({ maxSyncFrequencyHours: 24 }), 'sync')).toBe('Sync ogni giorno');
  });

  it('i clienti seguono il piano: inclusi col loro tetto, altrimenti riga grigia', () => {
    const customers = (plan: PlanRow) =>
      buildPlanFeatures(plan).find((f) => f.key === 'customers')!;

    expect(customers(row({ customersSyncEnabled: false }))).toEqual({
      key: 'customers',
      label: 'Sync clienti',
      included: false,
    });
    expect(customers(row({ customersSyncEnabled: true, maxCustomers: 50000 })).label).toBe(
      'Fino a 50.000 clienti',
    );
    expect(customers(row({ customersSyncEnabled: true, maxCustomers: null })).label).toBe(
      'Clienti illimitati',
    );
  });

  it('l’assistenza segue il livello registrato', () => {
    const has = (level: string, key: string) =>
      buildPlanFeatures(row({ supportLevel: level })).find((f) => f.key === key)!.included;

    expect(has('community', 'push')).toBe(false);
    expect(has('email', 'push')).toBe(false);
    expect(has('priority', 'push')).toBe(true);
    expect(has('dedicated', 'push')).toBe(true);
    expect(has('priority', 'chat')).toBe(false);
    expect(has('dedicated', 'chat')).toBe(true);
  });

  it('le label restano corte, altrimenti una card si alza sulle altre', () => {
    for (const plan of buildPlanCards(PLANS)) {
      for (const feature of plan.features) {
        expect(feature.label.length).toBeLessThanOrEqual(26);
      }
    }
  });
});

describe('formatPrice', () => {
  it('gli interi restano interi', () => {
    expect(formatPrice(0)).toBe('0');
    expect(formatPrice(29)).toBe('29');
  });
  it('i decimali si scrivono con la virgola', () => {
    expect(formatPrice(9.9)).toBe('9,90');
  });
});

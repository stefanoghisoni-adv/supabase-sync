import { describe, it, expect } from 'vitest';
import { PLAN_CATALOG, FEATURE_ORDER } from './plan-catalog';

describe('PLAN_CATALOG', () => {
  it('contiene i 4 piani nell ordine free, pro, business, enterprise', () => {
    expect(PLAN_CATALOG.map((p) => p.id)).toEqual(['free', 'pro', 'business', 'enterprise']);
  });

  it('ha esattamente un piano consigliato ed e Pro', () => {
    const rec = PLAN_CATALOG.filter((p) => p.recommended);
    expect(rec).toHaveLength(1);
    expect(rec[0].id).toBe('pro');
  });

  it('i prezzi mensili sono 0/29/99/299', () => {
    expect(PLAN_CATALOG.map((p) => p.priceMonthly)).toEqual([0, 29, 99, 299]);
  });

  it('ogni piano elenca le stesse righe nello stesso ordine', () => {
    for (const p of PLAN_CATALOG) {
      expect(p.features.map((f) => f.key)).toEqual([...FEATURE_ORDER]);
    }
  });

  // Con questo invariante sortFeatures (verdi in alto) e' un no-op: le righe delle
  // 4 card restano allineate. Se un piano futuro lo rompe, il test lo intercetta.
  it('in ogni piano le feature incluse precedono gia le non incluse', () => {
    for (const p of PLAN_CATALOG) {
      const firstExcluded = p.features.findIndex((f) => !f.included);
      if (firstExcluded === -1) continue;
      expect(p.features.slice(firstExcluded).every((f) => !f.included)).toBe(true);
    }
  });

  // Nella griglia a 4 colonne una label lunga andrebbe a capo e alzerebbe solo
  // quella card, disallineando i punti elenco.
  it('nessuna label supera i 24 caratteri (altrimenti va a capo)', () => {
    for (const p of PLAN_CATALOG) {
      for (const f of p.features) expect(f.label.length).toBeLessThanOrEqual(24);
    }
  });

  it('Free non include push manuale ne sync clienti', () => {
    const free = PLAN_CATALOG.find((p) => p.id === 'free')!;
    expect(free.features.find((f) => f.key === 'push')!.included).toBe(false);
    expect(free.features.find((f) => f.key === 'customers')!.included).toBe(false);
  });

  it('Pro non include push manuale ma include sync clienti', () => {
    const pro = PLAN_CATALOG.find((p) => p.id === 'pro')!;
    expect(pro.features.find((f) => f.key === 'push')!.included).toBe(false);
    expect(pro.features.find((f) => f.key === 'customers')!.included).toBe(true);
  });

  it('Business e Enterprise includono push manuale', () => {
    for (const id of ['business', 'enterprise'] as const) {
      const plan = PLAN_CATALOG.find((p) => p.id === id)!;
      expect(plan.features.find((f) => f.key === 'push')!.included).toBe(true);
    }
  });

  it('la chat dedicata e solo di Enterprise', () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.features.find((f) => f.key === 'chat')!.included).toBe(
        plan.id === 'enterprise',
      );
    }
  });

  // Devono combaciare con Plan.maxSyncFrequencyHours (prisma/seed.ts): la dashboard
  // legge la frequenza dal DB, la vetrina da qui, e il merchant vede entrambe.
  it('le frequenze annunciate sono 7/4/2/1 giorni', () => {
    expect(PLAN_CATALOG.map((p) => p.features.find((f) => f.key === 'sync')!.label)).toEqual([
      'Sync ogni 7 giorni',
      'Sync ogni 4 giorni',
      'Sync ogni 2 giorni',
      'Sync ogni giorno',
    ]);
  });
});

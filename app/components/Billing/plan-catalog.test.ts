import { describe, it, expect } from 'vitest';
import { PLAN_CATALOG } from './plan-catalog';

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

  it('ogni piano ha 5 feature', () => {
    for (const p of PLAN_CATALOG) expect(p.features).toHaveLength(5);
  });

  it('Free non include push manuale ne sync clienti', () => {
    const free = PLAN_CATALOG.find((p) => p.id === 'free')!;
    const push = free.features.find((f) => f.label.toLowerCase().includes('push manuale'))!;
    const cust = free.features.find((f) => f.label.toLowerCase().includes('sync clienti'))!;
    expect(push.included).toBe(false);
    expect(cust.included).toBe(false);
  });

  it('Pro non include push manuale ma include sync clienti', () => {
    const pro = PLAN_CATALOG.find((p) => p.id === 'pro')!;
    expect(pro.features.find((f) => f.label.toLowerCase().includes('push manuale'))!.included).toBe(false);
    expect(pro.features.find((f) => f.label.toLowerCase().includes('sync clienti'))!.included).toBe(true);
  });

  it('Business include push manuale', () => {
    const biz = PLAN_CATALOG.find((p) => p.id === 'business')!;
    expect(biz.features.find((f) => f.label.toLowerCase().includes('push manuale'))!.included).toBe(true);
  });
});

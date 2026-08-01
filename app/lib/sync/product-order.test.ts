import { describe, it, expect } from 'vitest';
import { sortByCreatedAtAsc } from './product-order';

const p = (id: number, created_at?: string | null) => ({ id, created_at });

describe('sortByCreatedAtAsc', () => {
  it('mette per primo il prodotto creato prima', () => {
    const out = sortByCreatedAtAsc([
      p(3, '2026-03-01T10:00:00Z'),
      p(1, '2024-01-15T08:30:00Z'),
      p(2, '2025-07-20T23:59:59Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('a parita di data decide l id, che cresce nel tempo', () => {
    const out = sortByCreatedAtAsc([
      p(20, '2026-01-01T00:00:00Z'),
      p(5, '2026-01-01T00:00:00Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual([5, 20]);
  });

  it('senza data i prodotti restano in ordine di id', () => {
    // Succede solo con `fields` ristretti: meglio un ordine prevedibile che
    // lasciarli dove capita.
    const out = sortByCreatedAtAsc([p(9), p(2, null), p(4)]);
    expect(out.map((x) => x.id)).toEqual([2, 4, 9]);
  });

  it('i prodotti senza data vengono prima di quelli con data', () => {
    const out = sortByCreatedAtAsc([p(1, '2020-01-01T00:00:00Z'), p(2)]);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });

  it('non tocca l array ricevuto', () => {
    const input = [p(2, '2026-01-02T00:00:00Z'), p(1, '2026-01-01T00:00:00Z')];
    const out = sortByCreatedAtAsc(input);
    expect(input.map((x) => x.id)).toEqual([2, 1]);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });

  it('lista vuota → lista vuota', () => {
    expect(sortByCreatedAtAsc([])).toEqual([]);
  });
});

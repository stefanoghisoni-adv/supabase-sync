import { describe, it, expect } from 'vitest';
import { buildHistorySeries } from './history-series';
import type { ProductEligibilitySnapshot } from '@prisma/client';

describe('buildHistorySeries', () => {
  it('restituisce i punti in ordine cronologico crescente', () => {
    const snapshots: ProductEligibilitySnapshot[] = [
      {
        id: '3',
        shopId: 'shop-1',
        day: new Date('2026-07-20T00:00:00Z'),
        eligibleCount: 30,
        createdAt: new Date(),
      },
      {
        id: '1',
        shopId: 'shop-1',
        day: new Date('2026-07-18T00:00:00Z'),
        eligibleCount: 10,
        createdAt: new Date(),
      },
      {
        id: '2',
        shopId: 'shop-1',
        day: new Date('2026-07-19T00:00:00Z'),
        eligibleCount: 20,
        createdAt: new Date(),
      },
    ];

    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    expect(result).toEqual([
      { day: '2026-07-18', count: 10 },
      { day: '2026-07-19', count: 20 },
      { day: '2026-07-20', count: 30 },
    ]);
  });

  it('formatta day come YYYY-MM-DD usando UTC', () => {
    const snapshots: ProductEligibilitySnapshot[] = [
      {
        id: '1',
        shopId: 'shop-1',
        day: new Date('2026-07-15T00:00:00Z'),
        eligibleCount: 5,
        createdAt: new Date(),
      },
    ];

    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    expect(result[0].day).toBe('2026-07-15');
    expect(typeof result[0].day).toBe('string');
  });

  it('non inventa giorni mancanti', () => {
    const snapshots: ProductEligibilitySnapshot[] = [
      {
        id: '1',
        shopId: 'shop-1',
        day: new Date('2026-07-18T00:00:00Z'),
        eligibleCount: 10,
        createdAt: new Date(),
      },
      {
        id: '2',
        shopId: 'shop-1',
        day: new Date('2026-07-22T00:00:00Z'),
        eligibleCount: 20,
        createdAt: new Date(),
      },
    ];

    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    // Non ci deve essere nessun riempimento dei giorni 19, 20, 21
    expect(result).toHaveLength(2);
    expect(result[0].day).toBe('2026-07-18');
    expect(result[1].day).toBe('2026-07-22');
  });

  it('scarta gli snapshot più vecchi di 30 giorni', () => {
    const snapshots: ProductEligibilitySnapshot[] = [
      {
        id: '1',
        shopId: 'shop-1',
        day: new Date('2026-06-20T00:00:00Z'), // 34 giorni fa
        eligibleCount: 5,
        createdAt: new Date(),
      },
      {
        id: '2',
        shopId: 'shop-1',
        day: new Date('2026-06-25T00:00:00Z'), // 29 giorni fa
        eligibleCount: 10,
        createdAt: new Date(),
      },
      {
        id: '3',
        shopId: 'shop-1',
        day: new Date('2026-07-20T00:00:00Z'), // 4 giorni fa
        eligibleCount: 15,
        createdAt: new Date(),
      },
    ];

    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    // Solo gli ultimi 2 snapshot (29 e 4 giorni fa) devono essere inclusi
    expect(result).toHaveLength(2);
    expect(result[0].day).toBe('2026-06-25');
    expect(result[1].day).toBe('2026-07-20');
  });

  it('gestisce correttamente un array vuoto', () => {
    const snapshots: ProductEligibilitySnapshot[] = [];
    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    expect(result).toEqual([]);
  });

  it('preserva il count corretto per ogni giorno', () => {
    const snapshots: ProductEligibilitySnapshot[] = [
      {
        id: '1',
        shopId: 'shop-1',
        day: new Date('2026-07-20T00:00:00Z'),
        eligibleCount: 42,
        createdAt: new Date(),
      },
      {
        id: '2',
        shopId: 'shop-1',
        day: new Date('2026-07-21T00:00:00Z'),
        eligibleCount: 0,
        createdAt: new Date(),
      },
    ];

    const today = new Date('2026-07-24T12:00:00Z');
    const result = buildHistorySeries(snapshots, today);

    expect(result[0].count).toBe(42);
    expect(result[1].count).toBe(0);
  });
});

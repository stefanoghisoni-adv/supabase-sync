import { describe, it, expect } from 'vitest';
import { buildMonthSeries, monthLabel } from './history-series';
import type { ProductEligibilitySnapshot } from '@prisma/client';

function snapshot(day: string, eligibleCount: number): ProductEligibilitySnapshot {
  return {
    id: day,
    shopId: 'shop-1',
    day: new Date(`${day}T00:00:00Z`),
    eligibleCount,
    createdAt: new Date(),
  };
}

describe('monthLabel', () => {
  it('mese e anno in chiaro', () => {
    expect(monthLabel(new Date('2026-08-01T12:00:00Z'))).toBe('Agosto 2026');
  });
  it('legge il mese in UTC', () => {
    // In fuso positivo i getter locali direbbero "1 settembre".
    expect(monthLabel(new Date('2026-08-31T23:30:00Z'))).toBe('Agosto 2026');
  });
});

describe('buildMonthSeries', () => {
  const today = new Date('2026-08-20T12:00:00Z');

  it('un punto per ogni giorno del mese, dal primo all\'ultimo', () => {
    const result = buildMonthSeries([snapshot('2026-08-10', 4)], today);

    expect(result).toHaveLength(31); // agosto
    expect(result[0].day).toBe(1);
    expect(result[30].day).toBe(31);
  });

  it('prima del primo snapshot la linea sta a zero, poi si alza', () => {
    // E' il caso di chi inizia a rendere sincronizzabili i prodotti a mese
    // gia' iniziato: fino a quel giorno non c'era nulla da sincronizzare.
    const result = buildMonthSeries([snapshot('2026-08-10', 6)], today);

    expect(result.slice(0, 9).map((p) => p.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result[9].count).toBe(6);
  });

  it('i giorni senza rilevazione tengono il valore del giorno prima', () => {
    // Un giorno senza snapshot non significa "zero prodotti idonei".
    const result = buildMonthSeries(
      [snapshot('2026-08-03', 5), snapshot('2026-08-06', 9)],
      today,
    );

    expect(result[2].count).toBe(5); // 3 agosto
    expect(result[3].count).toBe(5); // 4, mai rilevato
    expect(result[4].count).toBe(5); // 5, mai rilevato
    expect(result[5].count).toBe(9); // 6 agosto
    expect(result[19].count).toBe(9); // fino a oggi
  });

  it('i giorni futuri restano vuoti', () => {
    // Disegnarli a zero racconterebbe un calo che non e' avvenuto.
    const result = buildMonthSeries([snapshot('2026-08-10', 6)], today);

    expect(result[19].count).toBe(6); // 20 agosto, oggi
    expect(result[20].count).toBeNull(); // 21 agosto
    expect(result[30].count).toBeNull(); // 31 agosto
  });

  it('il mese parte dall\'ultimo valore noto del mese precedente', () => {
    // Chi arrivava da luglio con 6 prodotti idonei non riparte da zero il primo.
    const result = buildMonthSeries(
      [snapshot('2026-07-31', 6), snapshot('2026-08-15', 8)],
      today,
    );

    expect(result[0].count).toBe(6);
    expect(result[13].count).toBe(6);
    expect(result[14].count).toBe(8);
  });

  it('gli snapshot di mesi precedenti non diventano punti del mese', () => {
    const result = buildMonthSeries(
      [snapshot('2026-07-10', 3), snapshot('2026-07-31', 6)],
      today,
    );

    expect(result).toHaveLength(31);
    expect(result.slice(0, 20).every((p) => p.count === 6)).toBe(true);
  });

  it('nessuno snapshot → nessuna serie', () => {
    // La card mostra il messaggio "lo storico si costruisce da qui in avanti".
    expect(buildMonthSeries([], today)).toEqual([]);
  });

  it('ordina gli snapshot ricevuti fuori ordine', () => {
    const result = buildMonthSeries(
      [snapshot('2026-08-15', 8), snapshot('2026-08-02', 2)],
      today,
    );

    expect(result[1].count).toBe(2);
    expect(result[14].count).toBe(8);
  });

  it('un conteggio tornato a zero resta zero', () => {
    // Zero misurato e' un dato, non un buco: non va sostituito col valore prima.
    const result = buildMonthSeries(
      [snapshot('2026-08-05', 7), snapshot('2026-08-08', 0)],
      today,
    );

    expect(result[6].count).toBe(7); // 7 agosto, per trascinamento
    expect(result[7].count).toBe(0); // 8 agosto, misurato
    expect(result[8].count).toBe(0); // 9 agosto, per trascinamento
  });

  it('mesi corti: febbraio si ferma al 28', () => {
    const result = buildMonthSeries(
      [snapshot('2026-02-03', 4)],
      new Date('2026-02-10T12:00:00Z'),
    );

    expect(result).toHaveLength(28);
    expect(result[27].day).toBe(28);
  });

  it('il primo del mese ha un solo giorno gia\' arrivato', () => {
    const result = buildMonthSeries(
      [snapshot('2026-07-31', 6)],
      new Date('2026-08-01T09:00:00Z'),
    );

    expect(result[0].count).toBe(6);
    expect(result.slice(1).every((p) => p.count === null)).toBe(true);
  });
});

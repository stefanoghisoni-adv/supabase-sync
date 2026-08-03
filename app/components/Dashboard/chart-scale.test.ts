import { describe, it, expect } from 'vitest';
import { computeChartYMax, computeChartYTicks } from './chart-scale';

describe('computeChartYMax', () => {
  it('lascia respiro sopra il limite del piano anche con pochi sincronizzabili', () => {
    // 3 sincronizzabili, limite 100: il tetto deve stare SOPRA 100 cosi' la
    // linea tratteggiata resta visibile e non incollata al bordo superiore.
    const max = computeChartYMax(100, 3);
    expect(max).toBeGreaterThan(100);
    expect(max).toBe(150);
  });

  it('tiene una tacca intera sopra il limite', () => {
    // Limite 50: l'asse arriva a 75, cosi' sopra la tratteggiata resta spazio.
    expect(computeChartYMax(50, 2)).toBe(75);
    expect(computeChartYMax(10, 0)).toBe(20);
    expect(computeChartYMax(400, 12)).toBe(600);
  });

  it('tiene conto dei dati quando superano il limite del piano', () => {
    // Dati oltre il limite: il tetto segue i dati, non il limite.
    expect(computeChartYMax(50, 300)).toBeGreaterThan(300);
  });

  it('non forza un tetto quando non c\'e\' nulla da scalare', () => {
    expect(computeChartYMax(null, 0)).toBeUndefined();
    expect(computeChartYMax(0, 0)).toBeUndefined();
  });

  it('scala anche senza limite di piano, sui soli dati', () => {
    // Piano illimitato: nessuna tratteggiata da distanziare, solo i dati + 20%.
    expect(computeChartYMax(null, 8)).toBe(10);
    expect(computeChartYMax(null, 12)).toBe(20);
  });
});

describe('computeChartYTicks', () => {
  it('il limite cade su una tacca e l’asse prosegue oltre', () => {
    // L'esempio di riferimento: tetto 100 → 0, 25, 50, 75, 100, 125.
    expect(computeChartYTicks(100, 9)).toEqual([0, 25, 50, 75, 100, 125]);
  });

  it('vale per tetti diversi: il limite c’è sempre, e non è mai l’ultima tacca', () => {
    for (const limit of [10, 20, 50, 200, 400, 500, 1000, 5000]) {
      const ticks = computeChartYTicks(limit, 0)!;
      expect(ticks[0]).toBe(0);
      expect(ticks).toContain(limit);
      // Almeno un quarto di margine sopra il tetto.
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(limit * 1.25);
      // Passo costante.
      const step = ticks[1] - ticks[0];
      ticks.forEach((value, i) => expect(value).toBe(step * i));
    }
  });

  it('non si affolla né si svuota', () => {
    for (const limit of [10, 50, 100, 400, 1000]) {
      const ticks = computeChartYTicks(limit, 0)!;
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(9);
    }
  });

  it('se i dati sforano il tetto, l’asse li contiene comunque', () => {
    const ticks = computeChartYTicks(50, 300)!;
    expect(ticks).toContain(50);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(300);
  });

  it('piano senza tetto → nessuna tacca imposta', () => {
    expect(computeChartYTicks(null, 40)).toBeUndefined();
    expect(computeChartYTicks(0, 40)).toBeUndefined();
  });
});

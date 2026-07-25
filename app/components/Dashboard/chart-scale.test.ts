import { describe, it, expect } from 'vitest';
import { computeChartYMax } from './chart-scale';

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

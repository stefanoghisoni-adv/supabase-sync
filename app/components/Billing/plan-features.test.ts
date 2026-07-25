import { describe, it, expect } from 'vitest';
import { sortFeatures } from './plan-features';

describe('sortFeatures', () => {
  it('mette le incluse (verdi) prima delle non incluse (grigie)', () => {
    const input = [
      { label: 'A', included: false },
      { label: 'B', included: true },
      { label: 'C', included: false },
      { label: 'D', included: true },
    ];
    expect(sortFeatures(input).map((f) => f.label)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('e stabile: preserva l ordine originale dentro ciascun gruppo', () => {
    const input = [
      { label: '1', included: true },
      { label: '2', included: true },
      { label: '3', included: true },
    ];
    expect(sortFeatures(input).map((f) => f.label)).toEqual(['1', '2', '3']);
  });

  it('gestisce la lista vuota', () => {
    expect(sortFeatures([])).toEqual([]);
  });

  it('non muta l input', () => {
    const input = [
      { label: 'X', included: false },
      { label: 'Y', included: true },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    sortFeatures(input);
    expect(input).toEqual(snapshot);
  });
});

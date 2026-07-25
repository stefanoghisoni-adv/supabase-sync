import { describe, it, expect } from 'vitest';
import { shouldHighlightRecommended } from './plan-highlight';

describe('shouldHighlightRecommended', () => {
  it('risalta il consigliato se il piano attuale e piu basso', () => {
    expect(shouldHighlightRecommended('free')).toBe(true);
  });

  it('non risalta nulla se sono gia sul consigliato o piu su', () => {
    expect(shouldHighlightRecommended('pro')).toBe(false);
    expect(shouldHighlightRecommended('business')).toBe(false);
    expect(shouldHighlightRecommended('enterprise')).toBe(false);
  });

  it('tratta un piano fuori catalogo come superiore', () => {
    expect(shouldHighlightRecommended('lifetime')).toBe(false);
  });

  it('senza piano registrato assume Free (negozio appena installato)', () => {
    expect(shouldHighlightRecommended('')).toBe(true);
    expect(shouldHighlightRecommended(null)).toBe(true);
    expect(shouldHighlightRecommended(undefined)).toBe(true);
  });

  it('ignora maiuscole e spazi', () => {
    expect(shouldHighlightRecommended('  FREE ')).toBe(true);
    expect(shouldHighlightRecommended('Business')).toBe(false);
  });
});

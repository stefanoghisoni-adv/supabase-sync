import { describe, it, expect } from 'vitest';
import { shouldHighlightRecommended } from './plan-highlight';
import type { PlanCard } from './plan-catalog';

const card = (name: string, priceMonthly: number, recommended = false): PlanCard => ({
  name,
  priceMonthly,
  recommended,
  features: [],
});

const CARDS = [
  card('free', 0),
  card('pro', 29, true),
  card('business', 99),
  card('enterprise', 299),
];

describe('shouldHighlightRecommended', () => {
  it('risalta il consigliato se il piano attuale e piu basso', () => {
    expect(shouldHighlightRecommended(CARDS, 'free')).toBe(true);
  });

  it('non risalta nulla se sono gia sul consigliato o piu su', () => {
    expect(shouldHighlightRecommended(CARDS, 'pro')).toBe(false);
    expect(shouldHighlightRecommended(CARDS, 'business')).toBe(false);
    expect(shouldHighlightRecommended(CARDS, 'enterprise')).toBe(false);
  });

  it('tratta un piano fuori listino come superiore', () => {
    expect(shouldHighlightRecommended(CARDS, 'lifetime')).toBe(false);
  });

  it('senza piano registrato assume il piu basso (negozio appena installato)', () => {
    expect(shouldHighlightRecommended(CARDS, '')).toBe(true);
    expect(shouldHighlightRecommended(CARDS, null)).toBe(true);
    expect(shouldHighlightRecommended(CARDS, undefined)).toBe(true);
  });

  it('ignora maiuscole e spazi', () => {
    expect(shouldHighlightRecommended(CARDS, '  FREE ')).toBe(true);
    expect(shouldHighlightRecommended(CARDS, 'Business')).toBe(false);
  });

  it('listino senza consigliato → niente da risaltare', () => {
    expect(shouldHighlightRecommended([card('free', 0)], 'free')).toBe(false);
    expect(shouldHighlightRecommended([], 'free')).toBe(false);
  });
});

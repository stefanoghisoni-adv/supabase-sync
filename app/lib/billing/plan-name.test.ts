import { describe, it, expect } from 'vitest';
import { normalizePlanName, samePlanName } from './plan-name';

describe('normalizePlanName', () => {
  it('minuscolo e senza spazi ai bordi', () => {
    expect(normalizePlanName('  Pro  ')).toBe('pro');
    expect(normalizePlanName('BUSINESS')).toBe('business');
  });

  it('assente → stringa vuota', () => {
    expect(normalizePlanName(null)).toBe('');
    expect(normalizePlanName(undefined)).toBe('');
  });
});

describe('samePlanName', () => {
  it('stesso piano scritto diversamente', () => {
    expect(samePlanName('pro', 'Pro')).toBe(true);
    expect(samePlanName('  Free ', 'free')).toBe(true);
  });

  it('piani diversi', () => {
    expect(samePlanName('pro', 'business')).toBe(false);
  });

  it('due assenze non sono lo stesso piano', () => {
    expect(samePlanName(null, null)).toBe(false);
    expect(samePlanName('', '   ')).toBe(false);
    expect(samePlanName('pro', null)).toBe(false);
  });
});

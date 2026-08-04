import { describe, it, expect } from 'vitest';
import { forcedTestCharge } from './test-charge';

describe('forcedTestCharge', () => {
  it('acceso solo con "true"', () => {
    expect(forcedTestCharge('true')).toBe(true);
    expect(forcedTestCharge('TRUE')).toBe(true);
    expect(forcedTestCharge('  true  ')).toBe(true);
  });

  it('qualsiasi altro valore lascia l\'addebito reale', () => {
    expect(forcedTestCharge('false')).toBe(false);
    expect(forcedTestCharge('1')).toBe(false);
    expect(forcedTestCharge('yes')).toBe(false);
    expect(forcedTestCharge('')).toBe(false);
    expect(forcedTestCharge('   ')).toBe(false);
    expect(forcedTestCharge(undefined)).toBe(false);
    expect(forcedTestCharge(null)).toBe(false);
  });
});

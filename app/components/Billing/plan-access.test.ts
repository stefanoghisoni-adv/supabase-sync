import { describe, it, expect } from 'vitest';
import { canAccessPlanTab } from './plan-access';

describe('canAccessPlanTab', () => {
  it('nega l\'accesso al piano lifetime', () => {
    expect(canAccessPlanTab('lifetime')).toBe(false);
    // Come arriva dal DB o da un input sporco: case e spazi non devono aggirare il blocco.
    expect(canAccessPlanTab('  LIFETIME  ')).toBe(false);
    expect(canAccessPlanTab('Lifetime')).toBe(false);
  });

  it('consente l\'accesso ai piani a pagamento e al free', () => {
    expect(canAccessPlanTab('free')).toBe(true);
    expect(canAccessPlanTab('pro')).toBe(true);
    expect(canAccessPlanTab('business')).toBe(true);
    expect(canAccessPlanTab('enterprise')).toBe(true);
  });

  it('non blocca quando il piano non e\' noto', () => {
    // Shop appena installato o record mancante: meglio mostrare la tab che
    // nasconderla a chi invece deve poter fare upgrade.
    expect(canAccessPlanTab(null)).toBe(true);
    expect(canAccessPlanTab(undefined)).toBe(true);
    expect(canAccessPlanTab('')).toBe(true);
    expect(canAccessPlanTab('   ')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { subscriptionOutcome } from './subscription-status';

describe('subscriptionOutcome', () => {
  it('ACTIVE → active', () => {
    expect(subscriptionOutcome('ACTIVE')).toBe('active');
    expect(subscriptionOutcome('active')).toBe('active');
    expect(subscriptionOutcome('  ACTIVE  ')).toBe('active');
  });

  it('stati terminati → ended', () => {
    expect(subscriptionOutcome('CANCELLED')).toBe('ended');
    expect(subscriptionOutcome('EXPIRED')).toBe('ended');
    expect(subscriptionOutcome('DECLINED')).toBe('ended');
    expect(subscriptionOutcome('FROZEN')).toBe('ended');
    // Case-insensitive + trim
    expect(subscriptionOutcome('  cancelled  ')).toBe('ended');
  });

  it('stati transitori → ignore', () => {
    expect(subscriptionOutcome('PENDING')).toBe('ignore');
    expect(subscriptionOutcome('ACCEPTED')).toBe('ignore');
  });

  it('stati sconosciuti → ignore', () => {
    expect(subscriptionOutcome('UNKNOWN_STATE')).toBe('ignore');
    expect(subscriptionOutcome('')).toBe('ignore');
    expect(subscriptionOutcome('FUTURE_STATUS')).toBe('ignore');
  });
});

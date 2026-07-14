import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { signState, verifyState } from './supabase-oauth.server';

// Mock db.server and crypto.server - only test state functions which are pure
vi.mock('~/db.server', () => ({
  prisma: {},
}));

vi.mock('~/utils/crypto.server', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

vi.mock('./supabase-management.server', () => ({
  refreshAccessToken: vi.fn(),
}));

describe('signState / verifyState', () => {
  let original: string | undefined;
  beforeAll(() => {
    original = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ENCRYPTION_SECRET;
    else process.env.ENCRYPTION_SECRET = original;
  });

  it('round-trips the shopId', () => {
    const state = signState('shop-123');
    expect(verifyState(state)).toEqual({ shopId: 'shop-123' });
  });

  it('rejects a tampered state', () => {
    const state = signState('shop-123');
    const tampered = state.slice(0, -2) + (state.endsWith('a') ? 'bb' : 'aa');
    expect(verifyState(tampered)).toBeNull();
  });

  it('rejects an expired state', () => {
    const past = Date.now() - 60 * 60 * 1000; // 1h fa
    const state = signState('shop-123', past);
    expect(verifyState(state)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyState('not-a-valid-state')).toBeNull();
  });
});

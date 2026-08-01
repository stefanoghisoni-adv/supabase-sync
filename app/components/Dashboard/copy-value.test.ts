import { describe, it, expect } from 'vitest';
import { middleTruncate } from './copy-value';

describe('middleTruncate', () => {
  it('valore corto → invariato', () => {
    expect(middleTruncate('supabase-sync.vercel.app')).toBe('supabase-sync.vercel.app');
  });

  it('esattamente al limite → invariato', () => {
    expect(middleTruncate('abcdefghij', 10)).toBe('abcdefghij');
  });

  it('oltre il limite → taglio al centro, lunghezza rispettata', () => {
    const out = middleTruncate('abcdefghijklmnopqrst', 11);
    expect(out).toBe('abcde…pqrst');
    expect(out.length).toBeLessThanOrEqual(11);
  });

  it("la coda resta visibile: e' quella che distingue due chiavi simili", () => {
    const a = middleTruncate(`spx_${'a'.repeat(40)}FINE1`, 20);
    const b = middleTruncate(`spx_${'a'.repeat(40)}FINE2`, 20);
    expect(a).not.toBe(b);
  });

  it('limite assurdo → nessun taglio, meglio il valore intero', () => {
    expect(middleTruncate('abcdefgh', 3)).toBe('abcdefgh');
  });
});

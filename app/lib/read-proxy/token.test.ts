import { describe, it, expect, vi } from 'vitest';

vi.mock('~/utils/crypto.server', () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => v.replace(/^enc\(|\)$/g, ''),
}));
vi.mock('~/db.server', () => ({ prisma: { shop: { update: vi.fn() } } }));

import {
  generateReadProxyToken,
  hashReadProxyToken,
  extractReadProxyToken,
  getReadProxyTokenForDisplay,
} from './token.server';

describe('generateReadProxyToken', () => {
  it('ha prefisso spx_ ed è univoco', () => {
    const a = generateReadProxyToken();
    const b = generateReadProxyToken();
    expect(a.startsWith('spx_')).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('hashReadProxyToken', () => {
  it('è deterministico e in hex a 64 char (sha256)', () => {
    expect(hashReadProxyToken('spx_x')).toBe(hashReadProxyToken('spx_x'));
    expect(hashReadProxyToken('spx_x')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashReadProxyToken('a')).not.toBe(hashReadProxyToken('b'));
  });
});

describe('extractReadProxyToken', () => {
  const req = (h: Record<string, string>) => new Request('https://x/rest/v1/products', { headers: h });
  it('estrae dal Bearer', () => {
    expect(extractReadProxyToken(req({ authorization: 'Bearer spx_abc' }))).toBe('spx_abc');
  });
  it(`ripiega sull'header apikey`, () => {
    expect(extractReadProxyToken(req({ apikey: 'spx_def' }))).toBe('spx_def');
  });
  it('ritorna null se assente', () => {
    expect(extractReadProxyToken(req({}))).toBeNull();
  });
});

describe('getReadProxyTokenForDisplay', () => {
  it('decifra il token memorizzato', () => {
    expect(getReadProxyTokenForDisplay({ readProxyTokenEnc: 'enc(spx_z)' })).toBe('spx_z');
  });
  it('ritorna null se non emesso', () => {
    expect(getReadProxyTokenForDisplay({ readProxyTokenEnc: null })).toBeNull();
  });
});

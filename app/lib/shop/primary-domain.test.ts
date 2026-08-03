import { describe, it, expect } from 'vitest';
import { normalizePrimaryDomain, shouldUpdatePrimaryDomain } from './primary-domain';

describe('normalizePrimaryDomain', () => {
  it('tiene il dominio nudo', () => {
    expect(normalizePrimaryDomain('negozio.it')).toBe('negozio.it');
    expect(normalizePrimaryDomain('negozio.myshopify.com')).toBe('negozio.myshopify.com');
  });

  it('toglie protocollo, barra finale, spazi e maiuscole', () => {
    expect(normalizePrimaryDomain('  HTTPS://Negozio.IT/  ')).toBe('negozio.it');
    expect(normalizePrimaryDomain('http://negozio.it')).toBe('negozio.it');
  });

  it('scarta cio’ che non e’ un dominio', () => {
    expect(normalizePrimaryDomain(null)).toBeNull();
    expect(normalizePrimaryDomain('')).toBeNull();
    expect(normalizePrimaryDomain('   ')).toBeNull();
    expect(normalizePrimaryDomain('localhost')).toBeNull();
    expect(normalizePrimaryDomain('due domini.it')).toBeNull();
  });
});

describe('shouldUpdatePrimaryDomain', () => {
  it('primo riempimento', () => {
    expect(shouldUpdatePrimaryDomain(null, 'negozio.it')).toBe(true);
  });

  it('dominio cambiato → si riscrive', () => {
    expect(shouldUpdatePrimaryDomain('negozio.myshopify.com', 'negozio.it')).toBe(true);
  });

  it('stesso dominio → nessuna scrittura, nemmeno scritto diversamente', () => {
    expect(shouldUpdatePrimaryDomain('negozio.it', 'negozio.it')).toBe(false);
    expect(shouldUpdatePrimaryDomain('negozio.it', 'https://Negozio.IT/')).toBe(false);
  });

  it('risposta senza dominio non cancella quello che sapevamo', () => {
    // Meglio un valore vecchio che perderlo per una risposta incompleta.
    expect(shouldUpdatePrimaryDomain('negozio.it', null)).toBe(false);
    expect(shouldUpdatePrimaryDomain('negozio.it', '')).toBe(false);
  });
});

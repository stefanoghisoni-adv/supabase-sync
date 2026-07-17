import { describe, it, expect } from 'vitest';
import {
  normalizeAuthorization,
  isAuthorized,
  authorizationMessage,
} from './authorization.server';

describe('normalizeAuthorization', () => {
  it('default e valori sconosciuti → ENABLED', () => {
    expect(normalizeAuthorization(undefined)).toBe('ENABLED');
    expect(normalizeAuthorization(null)).toBe('ENABLED');
    expect(normalizeAuthorization('')).toBe('ENABLED');
    expect(normalizeAuthorization('qualcosa')).toBe('ENABLED');
  });

  it('riconosce PENDING e DISABLED, case-insensitive e con spazi', () => {
    expect(normalizeAuthorization('pending')).toBe('PENDING');
    expect(normalizeAuthorization('  Disabled ')).toBe('DISABLED');
    expect(normalizeAuthorization('ENABLED')).toBe('ENABLED');
  });
});

describe('isAuthorized', () => {
  it('true solo per ENABLED', () => {
    expect(isAuthorized('ENABLED')).toBe(true);
    expect(isAuthorized('PENDING')).toBe(false);
    expect(isAuthorized('DISABLED')).toBe(false);
    expect(isAuthorized(undefined)).toBe(true);
  });
});

describe('authorizationMessage', () => {
  it('fornisce messaggi per PENDING e DISABLED, vuoto per ENABLED', () => {
    expect(authorizationMessage('DISABLED')).toContain('disabilitato');
    expect(authorizationMessage('PENDING')).toContain('prova');
    expect(authorizationMessage('ENABLED')).toBe('');
  });
});

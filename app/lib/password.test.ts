import { describe, it, expect } from 'vitest';
import { generateDbPassword } from './password.server';

describe('generateDbPassword', () => {
  it('genera una password della lunghezza richiesta', () => {
    expect(generateDbPassword(24)).toHaveLength(24);
    expect(generateDbPassword(32)).toHaveLength(32);
  });

  it('usa un default di 24 caratteri', () => {
    expect(generateDbPassword()).toHaveLength(24);
  });

  it('genera valori diversi a ogni chiamata', () => {
    expect(generateDbPassword()).not.toBe(generateDbPassword());
  });

  it('contiene almeno una minuscola, una maiuscola e una cifra', () => {
    const p = generateDbPassword(40);
    expect(p).toMatch(/[a-z]/);
    expect(p).toMatch(/[A-Z]/);
    expect(p).toMatch(/[0-9]/);
  });
});

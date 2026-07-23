import { describe, it, expect } from 'vitest';
import {
  expectedTables,
  detectCreatedTables,
  tableCreationJobType,
} from './detect-created-tables';

describe('expectedTables', () => {
  it('senza clienti solo products', () => expect(expectedTables(false)).toEqual(['products']));
  it('con clienti entrambe', () => expect(expectedTables(true)).toEqual(['products', 'customers']));
});

describe('detectCreatedTables', () => {
  it('database vuoto con clienti inclusi → create entrambe', () => {
    expect(detectCreatedTables([], true)).toEqual(['products', 'customers']);
  });
  it('products gia presente → creata solo customers', () => {
    expect(detectCreatedTables(['products'], true)).toEqual(['customers']);
  });
  it('entrambe gia presenti → nessuna creata', () => {
    expect(detectCreatedTables(['products', 'customers'], true)).toEqual([]);
  });
  it('confronto insensibile alle maiuscole', () => {
    expect(detectCreatedTables(['PRODUCTS'], true)).toEqual(['customers']);
  });
  it('piano senza clienti ignora customers', () => {
    expect(detectCreatedTables([], false)).toEqual(['products']);
  });
});

describe('tableCreationJobType', () => {
  it('entrambe', () => expect(tableCreationJobType(['products', 'customers'])).toBe('table_create_both'));
  it('solo prodotti', () => expect(tableCreationJobType(['products'])).toBe('table_create_products'));
  it('solo clienti', () => expect(tableCreationJobType(['customers'])).toBe('table_create_customers'));
  it('niente creato → nessun evento', () => expect(tableCreationJobType([])).toBeNull());
});

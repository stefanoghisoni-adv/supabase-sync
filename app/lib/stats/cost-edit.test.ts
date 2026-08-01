import { describe, it, expect } from 'vitest';
import {
  normalizeCost,
  costFieldDisabled,
  collectPendingCosts,
  parseStoredCosts,
} from './cost-edit';

const ROWS = [
  { variantId: 1, inventoryItemId: 101 },
  { variantId: 2, inventoryItemId: 102 },
  { variantId: 3, inventoryItemId: null },
];

describe('normalizeCost', () => {
  it('virgola e spazi non cambiano il valore', () => {
    expect(normalizeCost(' 12,50 ')).toBe('12.50');
  });
  it('il punto resta com\'e\'', () => {
    expect(normalizeCost('12.50')).toBe('12.50');
  });
});

describe('costFieldDisabled', () => {
  it('mentre il merchant compila resta modificabile', () => {
    expect(costFieldDisabled({ updating: false, blocked: false })).toBe(false);
  });
  it('si blocca durante "Ricontrolla e aggiorna"', () => {
    expect(costFieldDisabled({ updating: true, blocked: false })).toBe(true);
  });
  it('si blocca a negozio sospeso', () => {
    expect(costFieldDisabled({ updating: false, blocked: true })).toBe(true);
  });
});

describe('collectPendingCosts', () => {
  it('raccoglie solo le righe compilate', () => {
    const { updates, rejected } = collectPendingCosts(ROWS, { 1: '12,50' });

    expect(updates).toEqual([{ variantId: 1, inventoryItemId: 101, cost: '12.50' }]);
    expect(rejected).toEqual([]);
  });

  it('i campi vuoti non sono ne\' da salvare ne\' da correggere', () => {
    // Sono righe che il merchant non ha ancora toccato.
    const { updates, rejected } = collectPendingCosts(ROWS, { 1: '', 2: '   ' });

    expect(updates).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('valore non numerico o negativo → da correggere', () => {
    const { updates, rejected } = collectPendingCosts(ROWS, { 1: 'abc', 2: '-3' });

    expect(updates).toEqual([]);
    expect(rejected).toEqual([
      { variantId: 1, reason: 'invalid' },
      { variantId: 2, reason: 'invalid' },
    ]);
  });

  it('zero e\' un costo valido', () => {
    const { updates } = collectPendingCosts(ROWS, { 1: '0' });
    expect(updates).toHaveLength(1);
  });

  it('variante senza inventory item → non c\'e\' dove scrivere il costo', () => {
    const { updates, rejected } = collectPendingCosts(ROWS, { 3: '10' });

    expect(updates).toEqual([]);
    expect(rejected).toEqual([{ variantId: 3, reason: 'no-inventory-item' }]);
  });

  it('valori di righe non piu\' in elenco vengono ignorati', () => {
    // Dopo un aggiornamento le righe risolte spariscono: i loro valori restano
    // in memoria ma non devono essere riscritti su Shopify.
    const { updates } = collectPendingCosts(ROWS, { 99: '10' });
    expect(updates).toEqual([]);
  });

  it('valide e da correggere convivono nello stesso invio', () => {
    const { updates, rejected } = collectPendingCosts(ROWS, { 1: '5', 2: 'x' });

    expect(updates).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe('parseStoredCosts', () => {
  it('niente da riprendere → nessun valore', () => {
    expect(parseStoredCosts(null)).toEqual({});
  });
  it('rilegge i valori messi da parte', () => {
    expect(parseStoredCosts('{"1":"12.50","2":"3"}')).toEqual({ 1: '12.50', 2: '3' });
  });
  it('contenuto illeggibile → si riparte da zero, senza rompere la pagina', () => {
    expect(parseStoredCosts('{non json')).toEqual({});
    expect(parseStoredCosts('[1,2]')).toEqual({});
  });
  it('scarta le voci di forma inattesa', () => {
    expect(parseStoredCosts('{"1":12,"due":"3","4":"7"}')).toEqual({ 4: '7' });
  });
});

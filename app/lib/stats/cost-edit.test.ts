import { describe, it, expect } from 'vitest';
import {
  normalizeCost,
  costFieldDisabled,
  isCostSaved,
  shouldSaveCost,
} from './cost-edit';

describe('normalizeCost', () => {
  it('virgola e spazi non cambiano il valore', () => {
    expect(normalizeCost(' 12,50 ')).toBe('12.50');
  });
  it('il punto resta com\'e\'', () => {
    expect(normalizeCost('12.50')).toBe('12.50');
  });
});

describe('costFieldDisabled', () => {
  const base = { saving: false, rechecking: false, blocked: false };

  it('a riposo il campo e\' modificabile', () => {
    expect(costFieldDisabled(base)).toBe(false);
  });

  it('dopo un salvataggio riuscito resta modificabile', () => {
    // Il salvataggio non e' un punto di non ritorno: se il costo inserito e'
    // sbagliato dev'essere possibile correggerlo subito.
    expect(costFieldDisabled(base)).toBe(false);
  });

  it('si blocca mentre la scrittura e\' in volo', () => {
    expect(costFieldDisabled({ ...base, saving: true })).toBe(true);
  });

  it('si blocca durante "Ricontrolla e aggiorna"', () => {
    expect(costFieldDisabled({ ...base, rechecking: true })).toBe(true);
  });

  it('si blocca a negozio sospeso', () => {
    expect(costFieldDisabled({ ...base, blocked: true })).toBe(true);
  });
});

describe('isCostSaved', () => {
  it('mai salvato → nessun tic', () => {
    expect(isCostSaved(undefined, '12.50')).toBe(false);
  });
  it('valore invariato → tic', () => {
    expect(isCostSaved('12.50', '12.50')).toBe(true);
  });
  it('scritto con la virgola ma identico → tic', () => {
    expect(isCostSaved('12.50', '12,50')).toBe(true);
  });
  it('valore modificato dopo il salvataggio → il tic sparisce', () => {
    expect(isCostSaved('12.50', '13')).toBe(false);
  });
  it('campo svuotato → il tic sparisce', () => {
    expect(isCostSaved('12.50', '')).toBe(false);
  });
});

describe('shouldSaveCost', () => {
  it('campo vuoto → non si salva', () => {
    expect(shouldSaveCost({ value: '   ', savedValue: undefined })).toBe(false);
  });
  it('primo valore inserito → si salva', () => {
    expect(shouldSaveCost({ value: '12,50', savedValue: undefined })).toBe(true);
  });
  it('uscire dal campo senza aver cambiato nulla → non si risalva', () => {
    // Il salvataggio scatta alla perdita del fuoco: senza questo controllo
    // ogni clic altrove rifarebbe la stessa scrittura su Shopify.
    expect(shouldSaveCost({ value: '12.50', savedValue: '12.50' })).toBe(false);
  });
  it('valore corretto dopo il salvataggio → si risalva', () => {
    expect(shouldSaveCost({ value: '13', savedValue: '12.50' })).toBe(true);
  });
});

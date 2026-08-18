import { describe, it, expect } from 'vitest';
import {
  FALLBACK_MARKET,
  marketFromId,
  marketFromTag,
  marketLabel,
  resolveMarket,
  MARKETS,
} from './markets';

describe('marketFromId', () => {
  it('riconosce i mercati', () => {
    expect(marketFromId('it')?.currency).toBe('EUR');
    expect(marketFromId('en-GB')?.currency).toBe('GBP');
  });

  it("'en' e' quello che c'e' gia' sul database: vale come mercato americano", () => {
    // Prima la scelta era la sola lingua. Chi l'aveva fatta non deve ritrovarsi
    // senza preferenza.
    expect(marketFromId('en')).toBe(FALLBACK_MARKET);
  });

  it("un valore che non conosciamo non e' un mercato", () => {
    expect(marketFromId('de')).toBeNull();
    expect(marketFromId(null)).toBeNull();
  });
});

describe('marketFromTag', () => {
  it("la lingua dell'admin sceglie il mercato", () => {
    expect(marketFromTag('it-IT')?.id).toBe('it');
    expect(marketFromTag('en-CA')?.id).toBe('en-US');
  });

  it("il Regno Unito e' l'unico caso in cui il paese conta", () => {
    // Due voci parlano inglese: a distinguerle e' la valuta.
    expect(marketFromTag('en-GB')?.id).toBe('en-GB');
  });

  it('una lingua che non abbiamo ripiega sul mercato di riserva', () => {
    expect(marketFromTag('de-DE')?.id).toBe('en-US');
    expect(marketFromTag(null)?.id).toBe('en-US');
  });
});

describe('resolveMarket', () => {
  it("la scelta del merchant vince sull'admin", () => {
    expect(resolveMarket('it', 'en-US').id).toBe('it');
  });

  it("senza scelta si segue l'admin", () => {
    expect(resolveMarket(null, 'it-IT').id).toBe('it');
  });
});

describe('marketLabel', () => {
  it('scrive la valuta che il negozio otterrebbe davvero', () => {
    const uk = MARKETS.find((m) => m.id === 'en-GB')!;
    // Il listino in sterline c'e': l'etichetta lo dice.
    expect(marketLabel(uk, 'GBP')).toBe('🇬🇧 English (UK) — GBP');
    // Non c'e': l'etichetta dice quello che finira' in fattura, non un
    // desiderio.
    expect(marketLabel(uk, 'USD')).toBe('🇬🇧 English (UK) — USD');
  });
});

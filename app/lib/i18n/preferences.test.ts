import { describe, it, expect } from 'vitest';
import {
  currencyOptions,
  localeFromTag,
  storedPreference,
  wantedCurrency,
  wantedLocale,
} from './preferences';

describe('storedPreference', () => {
  it('la lingua da sola resta una lingua', () => {
    expect(storedPreference('it')).toEqual({ locale: 'it', currency: null });
  });

  it("i mercati di prima portano con se' la valuta", () => {
    // Chi aveva gia' scelto "English (UK)" non deve ritrovarsi senza
    // preferenza: quella riga vale ancora, e vale anche per la sterlina.
    expect(storedPreference('en-GB')).toEqual({ locale: 'en', currency: 'GBP' });
    expect(storedPreference('en-US')).toEqual({ locale: 'en', currency: 'USD' });
  });

  it('quello che non conosciamo non e una scelta', () => {
    expect(storedPreference('de')).toEqual({ locale: null, currency: null });
    expect(storedPreference(null)).toEqual({ locale: null, currency: null });
  });
});

describe('wantedLocale', () => {
  it('la scelta del merchant vince su quella dedotta', () => {
    expect(wantedLocale({ locale: 'it', detectedLocale: 'en' })).toBe('it');
  });

  it("senza scelta si segue l'admin", () => {
    expect(wantedLocale({ detectedLocale: 'it' })).toBe('it');
    expect(wantedLocale(null, 'it-IT')).toBe('it');
  });

  it('una lingua che non abbiamo ripiega su quella di riserva', () => {
    expect(wantedLocale({ detectedLocale: 'de' })).toBe('en');
  });
});

describe('wantedCurrency', () => {
  it('la valuta scelta vince su tutto', () => {
    expect(wantedCurrency({ locale: 'it', preferredCurrency: 'GBP' })).toBe('GBP');
  });

  it('un negozio puo leggere in inglese e pagare in euro', () => {
    // E' la ragione per cui lingua e valuta si sono separate.
    expect(wantedCurrency({ locale: 'en', preferredCurrency: 'EUR' })).toBe('EUR');
  });

  it('senza scelta si parte da quella che di solito accompagna la lingua', () => {
    expect(wantedCurrency({ locale: 'it' })).toBe('EUR');
    expect(wantedCurrency({ locale: 'en' })).toBe('USD');
    expect(wantedCurrency({ detectedLocale: 'it' })).toBe('EUR');
  });

  it('la vecchia scelta unica vale ancora come valuta', () => {
    expect(wantedCurrency({ locale: 'en-GB' })).toBe('GBP');
  });
});

describe('currencyOptions', () => {
  it('offre solo le valute che il listino ha davvero', () => {
    const codes = currencyOptions(['USD', 'EUR']).map((o) => o.value);
    expect(codes).toEqual(['USD', 'EUR']);
  });

  it('la valuta base c e sempre: e quella in cui il listino e scritto', () => {
    expect(currencyOptions([]).map((o) => o.value)).toEqual(['USD']);
  });

  it('ogni riga porta bandiera e simbolo', () => {
    expect(currencyOptions(['EUR'])[1].label).toContain('🇪🇺');
    expect(currencyOptions(['EUR'])[1].label).toContain('€');
  });
});

describe('localeFromTag', () => {
  it('conta la prima parte del codice', () => {
    expect(localeFromTag('it-IT')).toBe('it');
    expect(localeFromTag('en-CA')).toBe('en');
  });
});

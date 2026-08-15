import { describe, it, expect } from 'vitest';
import {
  FALLBACK_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  isLocale,
  localeFromTag,
  needsSearch,
  resolveLocale,
} from './locales';

describe('LOCALE_LABELS', () => {
  it('ogni lingua ha il proprio nome, nella lingua stessa', () => {
    // Chi cerca la propria lingua in un elenco la cerca come la chiama lui.
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
    }
    expect(LOCALE_LABELS.en).toBe('English');
  });
});

describe('localeFromTag', () => {
  it('tiene la prima parte del codice', () => {
    expect(localeFromTag('it')).toBe('it');
    expect(localeFromTag('it-IT')).toBe('it');
    expect(localeFromTag('en-CA')).toBe('en');
    expect(localeFromTag('EN_us')).toBe('en');
  });

  it('una lingua che non abbiamo non e un guasto', () => {
    expect(localeFromTag('de-DE')).toBe(FALLBACK_LOCALE);
    expect(localeFromTag('')).toBe(FALLBACK_LOCALE);
    expect(localeFromTag(null)).toBe(FALLBACK_LOCALE);
  });
});

describe('resolveLocale', () => {
  it('la scelta del merchant vince sull admin', () => {
    // L'ha fatta lui: cambiare la lingua dell'admin non deve disfarla.
    expect(resolveLocale('en', 'it-IT')).toBe('en');
    expect(resolveLocale('it', 'en-US')).toBe('it');
  });

  it('senza scelta si segue l admin', () => {
    expect(resolveLocale(null, 'it-IT')).toBe('it');
    expect(resolveLocale(undefined, 'en-GB')).toBe('en');
  });

  it('senza scelta ne admin si ripiega sulla lingua di riserva', () => {
    expect(resolveLocale(null, null)).toBe(FALLBACK_LOCALE);
  });

  it('una scelta fuori elenco non blocca: vale come nessuna scelta', () => {
    expect(resolveLocale('klingon', 'it-IT')).toBe('it');
  });
});

describe('needsSearch', () => {
  it('con poche lingue la tendina basta', () => {
    expect(needsSearch(2)).toBe(false);
    expect(needsSearch(9)).toBe(false);
  });

  it('da dieci in poi l elenco va cercato, non scorso', () => {
    expect(needsSearch(10)).toBe(true);
    expect(needsSearch(30)).toBe(true);
  });
});

describe('isLocale', () => {
  it('riconosce le lingue che abbiamo davvero', () => {
    expect(isLocale('it')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

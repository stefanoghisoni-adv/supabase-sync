import { describe, it, expect } from 'vitest';
import { FALLBACK_LOCALE, LOCALES, needsSearch, SEARCHABLE_FROM } from './locales';

describe('lingua di riserva', () => {
  it("e' una delle lingue che abbiamo davvero", () => {
    expect(LOCALES).toContain(FALLBACK_LOCALE);
  });

  it("e' l'inglese: chi non ha l'admin in italiano capisce quello", () => {
    expect(FALLBACK_LOCALE).toBe('en');
  });
});

describe('needsSearch', () => {
  it('con poche voci una tendina basta', () => {
    expect(needsSearch(3)).toBe(false);
    expect(needsSearch(SEARCHABLE_FROM - 1)).toBe(false);
  });

  it('da dieci in su le voci si cercano invece di scorrerle', () => {
    expect(needsSearch(SEARCHABLE_FROM)).toBe(true);
    expect(needsSearch(40)).toBe(true);
  });
});

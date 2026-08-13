import { describe, it, expect } from 'vitest';
import {
  TRACKING_CATEGORIES,
  defaultSelection,
  isServerSideAnswer,
  knownPlatforms,
  selectedInCategory,
} from './tracking-platforms';

describe('TRACKING_CATEGORIES', () => {
  it('raccoglie le piattaforme nelle quattro categorie previste', () => {
    expect(TRACKING_CATEGORIES.map((c) => c.title)).toEqual([
      'Social & Browser',
      'Email',
      'CRM',
      'Analytics',
    ]);
  });

  it('nessun nome compare in due categorie', () => {
    // Un nome doppio farebbe contare due volte la stessa spunta.
    const names = TRACKING_CATEGORIES.flatMap((c) => c.platforms.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('defaultSelection', () => {
  it('parte dalle tre che quasi ogni negozio usa', () => {
    expect(defaultSelection()).toEqual(['Meta Ads', 'Google Ads', 'Google Analytics 4']);
  });
});

describe('selectedInCategory', () => {
  it('conta solo le spunte della categoria', () => {
    const social = TRACKING_CATEGORIES[0];
    expect(selectedInCategory(social, defaultSelection())).toBe(2);
    expect(selectedInCategory(social, [])).toBe(0);
    expect(selectedInCategory(social, ['Klaviyo'])).toBe(0);
  });
});

describe('isServerSideAnswer', () => {
  it('accetta le due risposte e nient\'altro', () => {
    expect(isServerSideAnswer('needs')).toBe(true);
    expect(isServerSideAnswer('has')).toBe(true);
    expect(isServerSideAnswer('forse')).toBe(false);
    expect(isServerSideAnswer(null)).toBe(false);
  });
});

describe('knownPlatforms', () => {
  it('tiene i nomi del catalogo e scarta il resto', () => {
    // L'elenco arriva dal browser: senza filtro ci si potrebbe scrivere dentro
    // qualunque cosa.
    expect(knownPlatforms(['Meta Ads', 'Piattaforma Inventata', 'Klaviyo'])).toEqual([
      'Meta Ads',
      'Klaviyo',
    ]);
  });

  it('regge un valore che non e nemmeno una lista', () => {
    expect(knownPlatforms('Meta Ads')).toEqual([]);
    expect(knownPlatforms(undefined)).toEqual([]);
    expect(knownPlatforms([1, null, { name: 'Meta Ads' }])).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';

import { navButtonLoading } from './nav-loading';

const base = {
  requested: true,
  navigationState: 'loading' as const,
  navigatingTo: '/plan',
  path: '/plan',
};

describe('navButtonLoading', () => {
  it('premuto e in viaggio verso la sua destinazione → in attesa', () => {
    expect(navButtonLoading(base)).toBe(true);
  });

  it('navigazione dal menu laterale → il pulsante resta fermo', () => {
    // E' il caso che ha fatto nascere questa funzione: il merchant cambia
    // sezione dal menu dell'admin e i pulsanti che portano li' si accendevano
    // come se li avesse premuti lui.
    expect(navButtonLoading({ ...base, requested: false })).toBe(false);
  });

  it('premuto ma la navigazione va altrove → resta fermo', () => {
    // Puo' succedere: si preme un pulsante e subito dopo si sceglie altro dal
    // menu. Comanda la destinazione vera, non l'intenzione.
    expect(navButtonLoading({ ...base, navigatingTo: '/logs' })).toBe(false);
  });

  it('nessuna navigazione in corso → resta fermo anche se premuto', () => {
    expect(
      navButtonLoading({
        ...base,
        navigationState: 'idle',
        navigatingTo: undefined,
      }),
    ).toBe(false);
  });

  it('invio di un form → non e un cambio di sezione', () => {
    expect(navButtonLoading({ ...base, navigationState: 'submitting' })).toBe(false);
  });
});

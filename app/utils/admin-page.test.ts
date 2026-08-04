import { describe, it, expect, vi } from 'vitest';

import { adminAppUrl, reloadWholePage } from './admin-page';

describe('adminAppUrl', () => {
  it('costruisce l indirizzo della pagina admin che ospita l app', () => {
    expect(adminAppUrl('negozio-prova.myshopify.com', 'abc123')).toBe(
      'https://admin.shopify.com/store/negozio-prova/apps/abc123',
    );
  });

  it('accetta il dominio con maiuscole e spazi ai bordi', () => {
    expect(adminAppUrl('  Negozio.myshopify.com ', 'abc123')).toBe(
      'https://admin.shopify.com/store/negozio/apps/abc123',
    );
  });

  it('senza dominio o senza chiave non inventa un indirizzo', () => {
    expect(adminAppUrl(null, 'abc123')).toBeNull();
    expect(adminAppUrl('negozio.myshopify.com', '')).toBeNull();
    expect(adminAppUrl(undefined, undefined)).toBeNull();
  });

  it('rifiuta un dominio che porterebbe altro dentro l URL', () => {
    // Il valore finisce in un indirizzo su cui si naviga: path, query e host
    // altrui non devono poterci entrare.
    expect(adminAppUrl('negozio.myshopify.com/../altro', 'abc123')).toBeNull();
    expect(adminAppUrl('negozio.myshopify.com?x=1', 'abc123')).toBeNull();
    expect(adminAppUrl('evil.com', 'abc123')).toBeNull();
    expect(adminAppUrl('negozio.myshopify.com', 'abc/../123')).toBeNull();
  });
});

describe('reloadWholePage', () => {
  function fakeWindow() {
    return { open: vi.fn(), location: { reload: vi.fn() } };
  }

  it('ricarica la pagina dell admin, non il solo iframe dell app', () => {
    // Ricaricare l'iframe ripete la richiesta della sua URL corrente, che dopo
    // una navigazione interna puo' non essere una pagina: e' cosi' che al
    // merchant e' comparsa una risposta grezza dentro l'app.
    const win = fakeWindow();

    reloadWholePage('https://admin.shopify.com/store/negozio/apps/abc123', win);

    expect(win.open).toHaveBeenCalledWith(
      'https://admin.shopify.com/store/negozio/apps/abc123',
      '_top',
    );
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('senza indirizzo dell admin ricarica il documento corrente', () => {
    const win = fakeWindow();

    reloadWholePage(null, win);

    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.reload).toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectTrackingChannels,
  detectThemeTracking,
  themeFilesToInspect,
  MAX_THEME_FILES,
} from './detect';

describe('detectTrackingChannels', () => {
  it('riconosce i canali che portano un tracciamento proprio', () => {
    const found = detectTrackingChannels([
      { name: 'Online Store' },
      { name: 'Facebook & Instagram' },
      { name: 'Google & YouTube' },
    ]);

    expect(found.map((f) => f.name)).toEqual(['Meta', 'Google']);
    expect(found[0]).toEqual({ kind: 'channel', name: 'Meta', where: 'Facebook & Instagram' });
  });

  it('funziona anche con i nomi tradotti', () => {
    // Shopify traduce i nomi dei canali: cercare la stringa esatta inglese
    // avrebbe smesso di funzionare su ogni negozio non in inglese.
    const found = detectTrackingChannels([{ name: 'Facebook e Instagram' }]);
    expect(found.map((f) => f.name)).toEqual(['Meta']);
  });

  it('ignora i canali che non tracciano nulla di terze parti', () => {
    const found = detectTrackingChannels([
      { name: 'Online Store' },
      { name: 'Punto vendita' },
      { name: 'Shop' },
    ]);
    expect(found).toEqual([]);
  });

  it('un canale con due marchi nel nome resta una sola voce', () => {
    // "Facebook & Instagram" e' una fonte di eventi, non due: elencarla due
    // volte farebbe sembrare il problema piu' grande di quello che e'.
    const found = detectTrackingChannels([{ name: 'Facebook & Instagram' }]);
    expect(found).toHaveLength(1);
  });
});

describe('detectThemeTracking', () => {
  it('trova GTM dallo script e dall identificativo', () => {
    const found = detectThemeTracking([
      {
        filename: 'layout/theme.liquid',
        content: '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>',
      },
    ]);
    expect(found).toEqual([
      { kind: 'theme', name: 'Google Tag Manager', where: 'layout/theme.liquid' },
    ]);
  });

  it('distingue GA4 da Google Ads, che condividono lo stesso script', () => {
    // gtag.js serve entrambi: a separarli e' il prefisso dell'identificativo.
    // Senza questa distinzione ogni negozio con Google Ads risulterebbe GA4.
    const soloAds = detectThemeTracking([
      { filename: 'layout/theme.liquid', content: "gtag('config', 'AW-123456789');" },
    ]);
    expect(soloAds.map((f) => f.name)).toEqual(['Google Ads']);

    const ga4 = detectThemeTracking([
      { filename: 'layout/theme.liquid', content: "gtag('config', 'G-ABC123XYZ');" },
    ]);
    expect(ga4.map((f) => f.name)).toEqual(['Google Analytics 4']);
  });

  it('trova il pixel Meta anche senza lo script di caricamento', () => {
    const found = detectThemeTracking([
      { filename: 'snippets/tracking.liquid', content: "fbq('track', 'PageView');" },
    ]);
    expect(found).toEqual([
      { kind: 'theme', name: 'Meta Pixel', where: 'snippets/tracking.liquid' },
    ]);
  });

  it('ignora il codice lasciato dentro un commento Liquid', () => {
    // Un frammento commentato non invia niente: segnalarlo manderebbe il
    // merchant a cercare un problema che non ha.
    const found = detectThemeTracking([
      {
        filename: 'layout/theme.liquid',
        content: '{% comment %}<script src="https://connect.facebook.net/en_US/fbevents.js"></script>{% endcomment %}',
      },
    ]);
    expect(found).toEqual([]);
  });

  it('lo stesso strumento in piu file compare una volta sola', () => {
    const found = detectThemeTracking([
      { filename: 'layout/theme.liquid', content: "fbq('init', '1');" },
      { filename: 'snippets/head.liquid', content: "fbq('track', 'ViewContent');" },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].where).toBe('layout/theme.liquid');
  });

  it('un tema senza tracciamento non produce risultati', () => {
    const found = detectThemeTracking([
      { filename: 'layout/theme.liquid', content: '<html><body>{{ content_for_layout }}</body></html>' },
    ]);
    expect(found).toEqual([]);
  });
});

describe('themeFilesToInspect', () => {
  it('tiene layout e snippets, scarta il resto', () => {
    const files = themeFilesToInspect([
      'layout/theme.liquid',
      'layout/password.liquid',
      'snippets/tracking.liquid',
      'sections/header.liquid',
      'templates/product.json',
      'assets/theme.css',
      'config/settings_data.json',
    ]);

    expect(files).toEqual([
      'layout/theme.liquid',
      'layout/password.liquid',
      'snippets/tracking.liquid',
    ]);
  });

  it('non supera il tetto che Shopify impone', () => {
    // Oltre cinquanta nomi la richiesta non viene troncata: viene rifiutata
    // intera, e il tema resta non letto senza che nessuno se ne accorga.
    const many = Array.from({ length: 80 }, (_, i) => `snippets/s${i}.liquid`);

    expect(themeFilesToInspect(many)).toHaveLength(MAX_THEME_FILES);
  });

  it('se deve tagliare, taglia gli snippet e non i layout', () => {
    // Il codice di tracciamento sta quasi sempre nel layout: e' l'ultimo file a
    // cui rinunciare.
    const many = Array.from({ length: 80 }, (_, i) => `snippets/s${i}.liquid`);
    const files = themeFilesToInspect([...many, 'layout/theme.liquid']);

    expect(files[0]).toBe('layout/theme.liquid');
    expect(files).toHaveLength(MAX_THEME_FILES);
  });
});

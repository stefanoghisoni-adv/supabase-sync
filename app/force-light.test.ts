import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// force-light.css e' un file generato: si rigenera copiando i token chiari da
// Polaris quando si aggiorna la libreria. E' un'operazione meccanica, facile da
// rifare perdendo per strada quello che la rende efficace — ed e' un guasto che
// non si vede finche' qualcuno non apre l'app con l'admin in tema scuro.
const css = readFileSync(join(__dirname, 'force-light.css'), 'utf8');

describe('force-light.css', () => {
  it('prende qualsiasi classe di tema scuro, non solo quelle di oggi', () => {
    expect(css).toContain('[class*="p-theme-dark"]');
  });

  it('impone il chiaro anche sulla radice, non solo dove trova una classe scura', () => {
    // La classe di tema sta in due posti (l'<html> e il div del ThemeProvider) e
    // puo' cambiare nome fra una versione di Polaris e l'altra: sulla radice i
    // valori chiari vanno imposti comunque, senza aspettare di riconoscere una
    // classe.
    expect(css).toContain(':root:not(.p-theme-light-high-contrast-experimental)');
  });

  it('ogni dichiarazione e marcata !important', () => {
    const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
    const declarations = body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);

    expect(declarations.length).toBeGreaterThan(100);
    // Senza !important il foglio vince solo se viene emesso dopo quello di
    // Polaris, e in una pagina d'errore l'ordine non e' lo stesso.
    const senzaImportant = declarations.filter((d) => !d.endsWith('!important'));
    expect(senzaImportant).toEqual([]);
  });

  it('copre i token che decidono se una schermata si legge', () => {
    for (const token of [
      '--p-color-bg:',
      '--p-color-bg-surface:',
      '--p-color-text:',
      '--p-color-border:',
      '--p-color-icon:',
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain('color-scheme:light');
  });

  it('lascia fuori il tema chiaro ad alto contrasto', () => {
    // Serve a chi ha bisogno di piu' contrasto: deve restare libero di
    // sovrascrivere i token chiari standard, quindi va escluso dal selettore e
    // non deve comparire fra quelli presi.
    const selector = css.slice(css.lastIndexOf('*/') + 2, css.indexOf('{'));
    expect(selector).toContain(':not(.p-theme-light-high-contrast-experimental)');
    expect(selector).not.toMatch(/(^|,)\s*\.p-theme-light-high-contrast/);
  });
});

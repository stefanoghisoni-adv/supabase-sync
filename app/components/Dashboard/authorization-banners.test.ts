import { describe, it, expect } from 'vitest';
import { authorizationBanners } from './authorization-banners';
import { it as itDict } from '~/lib/i18n/it';

const text = (bs: { message: string }[]) => bs.map((b) => b.message).join(' ');

describe('authorizationBanners', () => {
  it('tutto in regola → nessun banner', () => {
    expect(authorizationBanners('ENABLED', 'ENABLED', itDict)).toEqual([]);
  });

  it('app disabilitata ma tracciamento acceso → lo dice, e avvisa che i dati non si aggiornano', () => {
    // E' il caso per cui le due autorizzazioni sono state separate: dire
    // "tutto sospeso" a chi sta ancora tracciando sarebbe falso.
    const bs = authorizationBanners('DISABLED', 'ENABLED', itDict);
    expect(bs).toHaveLength(1);
    expect(bs[0].tone).toBe('critical');
    expect(text(bs)).toContain('Il tracciamento resta attivo');
    expect(text(bs)).toContain('non verranno più aggiornati');
  });

  it('app disabilitata e tracciamento sospeso → due banner distinti', () => {
    const bs = authorizationBanners('DISABLED', 'DISABLED', itDict);
    expect(bs.map((b) => b.id)).toEqual(['app', 'tracking']);
    expect(text(bs)).not.toContain('Il tracciamento resta attivo');
  });

  it('app in regola ma tracciamento sospeso → il merchant non deve cercare un guasto', () => {
    const bs = authorizationBanners('ENABLED', 'PENDING', itDict);
    expect(bs).toHaveLength(1);
    expect(bs[0].id).toBe('tracking');
    expect(bs[0].tone).toBe('warning');
    expect(text(bs)).toContain('Aggiorna il piano');
  });

  it('tracciamento disabilitato → tono critico e supporto, non upgrade', () => {
    const bs = authorizationBanners('ENABLED', 'DISABLED', itDict);
    expect(bs[0].tone).toBe('critical');
    expect(text(bs)).toContain('Contatta il supporto');
    expect(text(bs)).not.toContain('Aggiorna il piano');
  });

  it('prova terminata con tracciamento ancora acceso', () => {
    const bs = authorizationBanners('PENDING', 'ENABLED', itDict);
    expect(bs).toHaveLength(1);
    expect(bs[0].title).toBe('Periodo di prova terminato');
    expect(text(bs)).toContain('Il tracciamento resta attivo');
  });
});

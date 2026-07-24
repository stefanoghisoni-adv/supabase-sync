import { describe, it, expect } from 'vitest';
import { hasPlanChanged, syncButtonLabel, planChangeBanner } from './plan-upgrade';

describe('hasPlanChanged', () => {
  it('nessuna sync precedente → nessun cambio da segnalare', () => {
    expect(hasPlanChanged('pro', null)).toBe(false);
  });
  it('stesso piano → false', () => {
    expect(hasPlanChanged('free', 'free')).toBe(false);
  });
  it('piano diverso → true', () => {
    expect(hasPlanChanged('pro', 'free')).toBe(true);
  });
  it('vale anche in downgrade', () => {
    expect(hasPlanChanged('free', 'pro')).toBe(true);
  });
});

describe('syncButtonLabel', () => {
  it('piano cambiato e clienti inclusi → Sincronizza clienti', () => {
    expect(syncButtonLabel({ planChanged: true, customersEnabled: true })).toBe('Sincronizza clienti');
  });
  it('piano cambiato senza clienti → etichetta prodotti', () => {
    expect(syncButtonLabel({ planChanged: true, customersEnabled: false })).toBe('Sincronizza prodotti');
  });
  it('nessun cambio, con clienti', () => {
    expect(syncButtonLabel({ planChanged: false, customersEnabled: true })).toBe('Sincronizza prodotti e clienti');
  });
  it('nessun cambio, senza clienti', () => {
    expect(syncButtonLabel({ planChanged: false, customersEnabled: false })).toBe('Sincronizza prodotti');
  });
});

describe('planChangeBanner', () => {
  it('tetto che sale → success e nuovo limite', () => {
    const b = planChangeBanner({ currentMax: 400, previousMax: 50, customersEnabled: false });
    expect(b.tone).toBe('success');
    expect(b.message).toContain('400');
  });
  it('tetto illimitato → success e "senza limite"', () => {
    const b = planChangeBanner({ currentMax: null, previousMax: 50, customersEnabled: false });
    expect(b.tone).toBe('success');
    expect(b.message).toContain('senza limite');
  });
  it('con clienti inclusi cita la nuova tabella', () => {
    const b = planChangeBanner({ currentMax: 400, previousMax: 50, customersEnabled: true });
    expect(b.message).toContain('acconsentito al marketing');
  });
  it('tetto che scende → warning e avviso di rimozione', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: 400, customersEnabled: false });
    expect(b.tone).toBe('warning');
    expect(b.message).toContain('rimossi');
  });
  it('da illimitato a limitato → warning', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: null, customersEnabled: false });
    expect(b.tone).toBe('warning');
  });
  it('tetto invariato → success', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: 50, customersEnabled: true });
    expect(b.tone).toBe('success');
  });
});

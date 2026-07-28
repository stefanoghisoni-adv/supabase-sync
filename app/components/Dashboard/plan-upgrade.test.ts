import { describe, it, expect } from 'vitest';
import {
  hasPlanChanged,
  syncButtonLabel,
  planChangeBanner,
  shouldTriggerPlanCatchUp,
  syncCtaState,
} from './plan-upgrade';

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
  it('con clienti inclusi', () => {
    expect(syncButtonLabel({ customersEnabled: true })).toBe('Sincronizza prodotti e clienti');
  });
  it('senza clienti', () => {
    expect(syncButtonLabel({ customersEnabled: false })).toBe('Sincronizza prodotti');
  });
});

describe('syncCtaState', () => {
  const base = { blocked: false, inProgress: false, completed: false, planChanged: false };

  it('a piano cambiato non dice "completata" e non chiede un clic', () => {
    // E' il caso dell'upgrade: il recupero parte da solo, quindi il pulsante
    // resta disabilitato ma mostra che sta succedendo qualcosa.
    const cta = syncCtaState({ ...base, completed: true, planChanged: true });
    expect(cta.label).not.toContain('completata');
    expect(cta.disabled).toBe(true);
    expect(cta.loading).toBe(true);
  });

  it('sync completata e piano invariato → completata, disabilitato', () => {
    const cta = syncCtaState({ ...base, completed: true });
    expect(cta).toEqual({
      label: 'Sincronizzazione completata',
      disabled: true,
      loading: false,
    });
  });

  it('sync in corso vince su tutto', () => {
    const cta = syncCtaState({ ...base, inProgress: true, completed: true, planChanged: true });
    expect(cta.label).toBe('Sincronizzazione in corso…');
    expect(cta.loading).toBe(true);
  });

  it('mai sincronizzato su questa connessione → primo avvio manuale', () => {
    // Anche a piano cambiato: dopo un ricollegamento non c'e' nulla da
    // "allineare", si riparte da zero e l'avvio resta del merchant.
    const cta = syncCtaState({ ...base, planChanged: true });
    expect(cta).toEqual({ label: 'Avvia sincronizzazione', disabled: false, loading: false });
  });

  it('negozio sospeso → pulsante disabilitato', () => {
    expect(syncCtaState({ ...base, blocked: true }).disabled).toBe(true);
  });
});

describe('shouldTriggerPlanCatchUp', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();

  it('piano cambiato e nessuna sync recente → innesca', () => {
    expect(
      shouldTriggerPlanCatchUp({
        planChanged: true,
        syncInProgress: false,
        lastBulkStartedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it('non innesca se il piano non e\' cambiato', () => {
    expect(
      shouldTriggerPlanCatchUp({
        planChanged: false,
        syncInProgress: false,
        lastBulkStartedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('non innesca mentre una sync e\' gia\' in corso', () => {
    expect(
      shouldTriggerPlanCatchUp({
        planChanged: true,
        syncInProgress: true,
        lastBulkStartedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('non rinnesca se una corsa e\' appena partita', () => {
    // Ricaricare la dashboard due volte di fila non deve far partire due corse.
    expect(
      shouldTriggerPlanCatchUp({
        planChanged: true,
        syncInProgress: false,
        lastBulkStartedAt: new Date(now - 10_000),
        now,
      }),
    ).toBe(false);
  });

  it('riprova quando la corsa precedente e\' vecchia', () => {
    expect(
      shouldTriggerPlanCatchUp({
        planChanged: true,
        syncInProgress: false,
        lastBulkStartedAt: new Date(now - 300_000),
        now,
      }),
    ).toBe(true);
  });
});

describe('planChangeBanner', () => {
  const noCustomers = { customersEnabled: false, previousCustomersEnabled: false };
  const withCustomers = { customersEnabled: true, previousCustomersEnabled: true };
  const text = (b: { messages: string[] }) => b.messages.join(' ');

  it('tetto che sale → success e nuovo limite', () => {
    const b = planChangeBanner({ currentMax: 400, previousMax: 50, ...noCustomers });
    expect(b.tone).toBe('success');
    expect(text(b)).toContain('400');
  });
  it('tetto illimitato → success e "senza limite"', () => {
    const b = planChangeBanner({ currentMax: null, previousMax: 50, ...noCustomers });
    expect(b.tone).toBe('success');
    expect(text(b)).toContain('senza limite');
  });
  it('tetto che scende → warning e avviso di rimozione', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: 400, ...noCustomers });
    expect(b.tone).toBe('warning');
    expect(text(b)).toContain('rimossi');
  });
  it('da illimitato a limitato → warning', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: null, ...noCustomers });
    expect(b.tone).toBe('warning');
  });
  it('tetto invariato → success', () => {
    const b = planChangeBanner({ currentMax: 50, previousMax: 50, ...withCustomers });
    expect(b.tone).toBe('success');
  });

  it('clienti appena sbloccati → success, tabella creata e popolata subito', () => {
    const b = planChangeBanner({
      currentMax: 400,
      previousMax: 50,
      customersEnabled: true,
      previousCustomersEnabled: false,
    });
    expect(b.tone).toBe('success');
    expect(b.messages).toHaveLength(2);
    expect(text(b)).toContain('acconsentito al marketing');
    expect(text(b)).toContain('subito');
    // La sync successiva viaggia con quella dei prodotti: va detto.
    expect(text(b)).toContain('periodica dei prodotti');
  });

  it('clienti persi → warning: sync sospesa ma dati non cancellati', () => {
    const b = planChangeBanner({
      currentMax: 50,
      previousMax: 400,
      customersEnabled: false,
      previousCustomersEnabled: true,
    });
    expect(b.tone).toBe('warning');
    expect(text(b)).toContain('si interrompe');
    expect(text(b)).toContain('non vengono cancellati');
    expect(text(b)).toContain('tracciamento');
  });

  it('clienti persi con tetto prodotti invariato → resta warning', () => {
    // Il tetto non cambia, ma perdere la sync clienti e' comunque un passo indietro.
    const b = planChangeBanner({
      currentMax: 400,
      previousMax: 400,
      customersEnabled: false,
      previousCustomersEnabled: true,
    });
    expect(b.tone).toBe('warning');
  });

  it('clienti gia\' inclusi prima e dopo → nessun paragrafo sui clienti', () => {
    const b = planChangeBanner({ currentMax: 400, previousMax: 100, ...withCustomers });
    expect(b.messages).toHaveLength(1);
  });
});

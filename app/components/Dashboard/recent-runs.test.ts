import { describe, it, expect } from 'vitest';
import { recentRunLabel, recentRunRows } from './recent-runs';
// Alias: `it` e' anche il nome del caso di test in vitest.
import { it as itDict } from '~/lib/i18n/it';

describe('recentRunLabel', () => {
  it('dà un nome parlante a ogni tipo di corsa', () => {
    expect(recentRunLabel('initial_bulk', itDict)).toBe('Sincronizzazione completa');
    expect(recentRunLabel('periodic_check', itDict)).toBe('Aggiornamento periodico');
    expect(recentRunLabel('webhook', itDict)).toBe('Aggiornamento da Shopify');
  });

  it('per le creazioni di tabella riusa la frase del registro', () => {
    expect(recentRunLabel('table_create_customers', itDict)).toBe(
      'Creazione tabella clienti riuscita',
    );
  });

  it('un tipo mai visto non lascia la riga senza nome', () => {
    expect(recentRunLabel('qualcosa_di_nuovo', itDict)).toBe('Sincronizzazione');
  });
});

describe('recentRunRows', () => {
  const run = (id: string, jobType: string, status = 'completed'): {
    id: string;
    jobType: string;
    status: string;
    startedAt: string;
  } => ({ id, jobType, status, startedAt: '2026-08-13T10:00:00.000Z' });

  it('tiene le più recenti fino al limite, nell\'ordine ricevuto', () => {
    const rows = recentRunRows(
      [
        run('1', 'periodic_check'),
        run('2', 'periodic_check'),
        run('3', 'periodic_check'),
        run('4', 'periodic_check'),
        run('5', 'periodic_check'),
        run('6', 'periodic_check'),
      ],
      itDict,
      5,
    );

    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('le richieste GDPR non sono sincronizzazioni e restano fuori', () => {
    // Arrivano da Shopify e finiscono nel registro completo: in un riquadro
    // intitolato "Ultime sincronizzazioni" direbbero una cosa per un'altra.
    const rows = recentRunRows([
      run('gdpr', 'gdpr_redact'),
      run('sync', 'periodic_check'),
    ], itDict);

    expect(rows.map((r) => r.id)).toEqual(['sync']);
  });

  it('porta lo stato della corsa nel badge', () => {
    const rows = recentRunRows([run('ko', 'periodic_check', 'failed')], itDict);

    expect(rows[0].badge).toEqual({ tone: 'critical', label: 'Fallita' });
  });

  it('senza corse non inventa righe', () => {
    expect(recentRunRows([], itDict)).toEqual([]);
  });
});

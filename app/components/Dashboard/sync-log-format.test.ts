import { describe, it, expect } from 'vitest';
import {
  tableCreationMessage,
  syncStatusBadge,
  formatDuration,
  formatDateTime,
  syncRowNumbers,
  syncErrorMessage,
} from './sync-log-format';

describe('tableCreationMessage', () => {
  it('mappa i tre eventi di creazione', () => {
    expect(tableCreationMessage('table_create_products')).toBe('Creazione tabella prodotti riuscita');
    expect(tableCreationMessage('table_create_customers')).toBe('Creazione tabella clienti riuscita');
    expect(tableCreationMessage('table_create_both')).toBe('Creazione tabelle prodotti e clienti riuscita');
  });
  it('un job di sync non e un evento di creazione', () => {
    expect(tableCreationMessage('initial_bulk')).toBeNull();
  });
});

describe('syncStatusBadge', () => {
  it('completed', () => expect(syncStatusBadge('completed')).toEqual({ tone: 'success', label: 'Completata' }));
  it('failed', () => expect(syncStatusBadge('failed')).toEqual({ tone: 'critical', label: 'Fallita' }));
  it('running', () => expect(syncStatusBadge('running')).toEqual({ tone: 'info', label: 'In corso' }));
});

describe('formatDuration', () => {
  it('senza completamento non c e durata', () => {
    expect(formatDuration('2026-07-24T00:00:00.000Z', null)).toBeNull();
  });
  it('secondi con un decimale', () => {
    expect(formatDuration('2026-07-24T00:00:00.000Z', '2026-07-24T00:00:03.200Z')).toBe('3.2 s');
  });
  it('sotto il secondo in millisecondi', () => {
    expect(formatDuration('2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.400Z')).toBe('400 ms');
  });
});

describe('formatDateTime', () => {
  // Istante noto in UTC: le 12:05 UTC del 24 luglio 2026.
  const iso = '2026-07-24T12:05:00.000Z';

  it('formatta nel fuso indicato', () => {
    // Europe/Rome d'estate e UTC+2.
    expect(formatDateTime(iso, 'Europe/Rome')).toBe('24/07/2026 14:05');
  });

  it('fuso assente → UTC', () => {
    expect(formatDateTime(iso, null)).toBe('24/07/2026 12:05');
    expect(formatDateTime(iso)).toBe('24/07/2026 12:05');
  });

  it('fuso non valido → ricade su UTC senza lanciare', () => {
    expect(formatDateTime(iso, 'Non/Esiste')).toBe('24/07/2026 12:05');
  });

  it('fuso diverso produce un orario diverso dallo stesso istante', () => {
    expect(formatDateTime(iso, 'America/New_York')).toBe('24/07/2026 08:05');
  });
});

describe('syncRowNumbers', () => {
  const job = { jobType: 'initial_bulk', variantsSynced: 12, customersSynced: 148 };
  it('senza clienti nel piano mostra solo le varianti', () => {
    expect(syncRowNumbers(job, false)).toBe('12 varianti idonee');
  });
  it('con clienti nel piano mostra entrambi', () => {
    expect(syncRowNumbers(job, true)).toBe('12 varianti idonee · 148 clienti');
  });
  it('per la creazione tabelle la colonna e vuota', () => {
    expect(syncRowNumbers({ ...job, jobType: 'table_create_both' }, true)).toBe('');
  });
});

describe('syncErrorMessage', () => {
  it('tabella prodotti non trovata → frase leggibile', () => {
    expect(
      syncErrorMessage(
        "Supabase products upsert failed: Could not find the table 'public.products' in the schema cache",
      ),
    ).toBe('Non è stata trovata nessuna tabella per i prodotti');
  });

  it('tabella clienti non trovata → frase leggibile', () => {
    expect(
      syncErrorMessage(
        "Supabase customer upsert failed: Could not find the table 'public.customers' in the schema cache",
      ),
    ).toBe('Non è stata trovata nessuna tabella per i clienti');
  });

  it('vale anche per il "does not exist" di Postgres', () => {
    expect(syncErrorMessage('relation "products" does not exist')).toBe(
      'Non è stata trovata nessuna tabella per i prodotti',
    );
    expect(syncErrorMessage('relation "customers" does not exist')).toBe(
      'Non è stata trovata nessuna tabella per i clienti',
    );
  });

  it('errori che non sappiamo tradurre passano com’erano', () => {
    // Meglio un errore tecnico che nessun errore: chi guarda il log deve
    // comunque poterlo riportare al supporto.
    expect(syncErrorMessage('Shopify API error: 429')).toBe('Shopify API error: 429');
  });

  it('errore assente o vuoto → non lascia la cella muta', () => {
    expect(syncErrorMessage(null)).toBe('Errore sconosciuto');
    expect(syncErrorMessage('   ')).toBe('Errore sconosciuto');
  });
});

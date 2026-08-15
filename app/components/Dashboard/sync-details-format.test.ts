// Alias: `it` e' anche il nome del caso di test in vitest.
import { it as itDict } from '~/lib/i18n/it';
import { describe, it, expect } from 'vitest';
import {
  detailBadge,
  productSummary,
  customerSummary,
  truncationNotice,
  visibleTabs,
} from './sync-details-format';

describe('detailBadge', () => {
  it('mappa le quattro azioni note', () => {
    expect(detailBadge('added', itDict)).toEqual({ tone: 'success', label: 'Aggiunto' });
    expect(detailBadge('removed', itDict)).toEqual({ tone: 'critical', label: 'Rimosso' });
    expect(detailBadge('updated', itDict)).toEqual({ tone: 'info', label: 'Aggiornato' });
    expect(detailBadge('suspended', itDict)).toEqual({ tone: 'warning', label: 'Sospeso' });
  });

  it('azione sconosciuta → fallback neutro', () => {
    expect(detailBadge('unknown', itDict)).toEqual({ tone: 'info', label: 'unknown' });
  });
});

describe('productSummary', () => {
  it('entrambi i conteggi maggiori di zero', () => {
    expect(productSummary(12, 3, itDict)).toBe('12 aggiunti · 3 rimossi');
  });

  it('plurale singolare: 1 aggiunto', () => {
    expect(productSummary(1, 0, itDict)).toBe('1 aggiunto');
  });

  it('plurale singolare: 1 rimosso', () => {
    expect(productSummary(0, 1, itDict)).toBe('1 rimosso');
  });

  it('solo aggiunti', () => {
    expect(productSummary(5, 0, itDict)).toBe('5 aggiunti');
  });

  it('solo rimossi', () => {
    expect(productSummary(0, 8, itDict)).toBe('8 rimossi');
  });

  it('entrambi a zero → stringa vuota', () => {
    expect(productSummary(0, 0, itDict)).toBe('');
  });
});

describe('customerSummary', () => {
  it('tutti e tre i conteggi maggiori di zero', () => {
    expect(customerSummary(148, 5, 2, itDict)).toBe('148 aggiunti · 5 aggiornati · 2 sospesi');
  });

  it('plurale singolare: 1 aggiunto, 1 aggiornato, 1 sospeso', () => {
    expect(customerSummary(1, 1, 1, itDict)).toBe('1 aggiunto · 1 aggiornato · 1 sospeso');
  });

  it('solo aggiunti', () => {
    expect(customerSummary(20, 0, 0, itDict)).toBe('20 aggiunti');
  });

  it('solo aggiornati', () => {
    expect(customerSummary(0, 7, 0, itDict)).toBe('7 aggiornati');
  });

  it('solo sospesi', () => {
    expect(customerSummary(0, 0, 3, itDict)).toBe('3 sospesi');
  });

  it('aggiunti e aggiornati, nessun sospeso', () => {
    expect(customerSummary(10, 2, 0, itDict)).toBe('10 aggiunti · 2 aggiornati');
  });

  it('tutti a zero → stringa vuota', () => {
    expect(customerSummary(0, 0, 0, itDict)).toBe('');
  });
});

describe('truncationNotice', () => {
  it('truncated true → messaggio', () => {
    expect(truncationNotice(true, itDict)).toBe('Elenco parziale: mostrate le prime 500 voci.');
  });

  it('truncated false → null', () => {
    expect(truncationNotice(false, itDict)).toBeNull();
  });
});

describe('visibleTabs', () => {
  it('clienti abilitati → entrambe le tab', () => {
    expect(visibleTabs(true)).toEqual(['products', 'customers']);
  });

  it('clienti non abilitati → solo prodotti', () => {
    expect(visibleTabs(false)).toEqual(['products']);
  });
});

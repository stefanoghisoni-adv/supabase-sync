import { describe, it, expect } from 'vitest';
import {
  createEventBuffer,
  formatProductLabel,
  MAX_EVENTS_PER_ENTITY,
} from './job-events';

describe('createEventBuffer', () => {
  it('normalizza gli id Shopify in BigInt e riempie i campi opzionali', () => {
    const buffer = createEventBuffer();
    buffer.add({
      entity: 'product',
      action: 'added',
      shopifyId: 42,
      variantId: 4242,
      label: 'Maglietta',
      sublabel: 'Rossa / M',
    });

    expect(buffer.pending()).toEqual([
      {
        entity: 'product',
        action: 'added',
        shopifyId: 42n,
        variantId: 4242n,
        label: 'Maglietta',
        sublabel: 'Rossa / M',
      },
    ]);
  });

  it('dei clienti tiene il conto e nient\'altro', () => {
    // La riga di dettaglio di un cliente non deve esistere sul database
    // dell'applicazione: ne' il nome, ne' l'identificativo Shopify. Il conteggio
    // basta a dire al merchant quanti clienti sono cambiati.
    const buffer = createEventBuffer();
    buffer.count('customer', 'added');
    buffer.count('customer', 'added');
    buffer.count('customer', 'suspended');

    expect(buffer.pending()).toEqual([]);
    expect(buffer.counters().customersAdded).toBe(2);
    expect(buffer.counters().customersSuspended).toBe(1);
  });

  it('conta ogni categoria nella sua casella', () => {
    const buffer = createEventBuffer();
    buffer.add({ entity: 'product', action: 'added', label: 'A' });
    buffer.add({ entity: 'product', action: 'removed', label: 'B' });
    buffer.add({ entity: 'product', action: 'removed', label: 'C' });
    buffer.count('customer', 'added');
    buffer.count('customer', 'updated');
    buffer.count('customer', 'suspended');

    expect(buffer.counters()).toEqual({
      productsAdded: 1,
      productsRemoved: 2,
      customersAdded: 1,
      customersUpdated: 1,
      customersSuspended: 1,
    });
  });

  it('oltre il tetto smette di salvare righe ma continua a contare', () => {
    // È la promessa su cui si regge il "mostrate 3 di 10" nel dettaglio: il
    // totale resta quello vero anche quando le righe sono troncate.
    const buffer = createEventBuffer(3);
    for (let i = 0; i < 10; i++) {
      buffer.add({ entity: 'product', action: 'added', shopifyId: i, label: `P${i}` });
    }

    expect(buffer.pending()).toHaveLength(3);
    expect(buffer.pending().map((row) => row.label)).toEqual(['P0', 'P1', 'P2']);
    expect(buffer.counters().productsAdded).toBe(10);
  });

  it('il tetto non tocca i conteggi dei clienti', () => {
    // I clienti non occupano righe: il tetto vale sui prodotti, il loro
    // conteggio corre a parte e resta intero.
    const buffer = createEventBuffer(2);
    buffer.add({ entity: 'product', action: 'added', label: 'P1' });
    buffer.add({ entity: 'product', action: 'added', label: 'P2' });
    buffer.add({ entity: 'product', action: 'added', label: 'P3' });
    buffer.count('customer', 'added');
    buffer.count('customer', 'added');

    expect(buffer.pending().map((row) => row.label)).toEqual(['P1', 'P2']);
    expect(buffer.counters().productsAdded).toBe(3);
    expect(buffer.counters().customersAdded).toBe(2);
  });

  it('il tetto di default è 500 righe', () => {
    const buffer = createEventBuffer();
    for (let i = 0; i < MAX_EVENTS_PER_ENTITY + 25; i++) {
      buffer.add({ entity: 'product', action: 'added', label: `P${i}` });
    }

    expect(buffer.pending()).toHaveLength(MAX_EVENTS_PER_ENTITY);
    expect(buffer.counters().productsAdded).toBe(MAX_EVENTS_PER_ENTITY + 25);
  });

  it('drain svuota le righe ma non azzera contatori né tetto', () => {
    // Chi svuota si prende le righe: una seconda scrittura non deve duplicarle,
    // e il tetto non deve ricominciare da capo per il resto della corsa.
    const buffer = createEventBuffer(2);
    buffer.add({ entity: 'product', action: 'added', label: 'P1' });
    buffer.add({ entity: 'product', action: 'added', label: 'P2' });

    expect(buffer.drain().map((row) => row.label)).toEqual(['P1', 'P2']);
    expect(buffer.drain()).toEqual([]);

    buffer.add({ entity: 'product', action: 'added', label: 'P3' });
    expect(buffer.drain()).toEqual([]);
    expect(buffer.counters().productsAdded).toBe(3);
  });

  it('absorb somma i contatori e accoda le righe senza ricontarle', () => {
    const products = createEventBuffer();
    products.add({ entity: 'product', action: 'added', label: 'P1' });

    const customers = createEventBuffer(1);
    customers.count('customer', 'added');
    customers.count('customer', 'added');

    products.absorb(customers);

    expect(products.pending().map((row) => row.label)).toEqual(['P1']);
    expect(products.counters()).toEqual({
      productsAdded: 1,
      productsRemoved: 0,
      // Due aggiunte contate, nessuna riga: i clienti non ne hanno.
      customersAdded: 2,
      customersUpdated: 0,
      customersSuspended: 0,
    });
  });

  it('un id che non è un intero non diventa un BigInt che lancia', () => {
    const buffer = createEventBuffer();
    buffer.add({ entity: 'product', action: 'added', shopifyId: 1.5, label: 'P' });

    expect(buffer.pending()[0].shopifyId).toBeNull();
  });
});

describe('formatProductLabel', () => {
  it('usa il titolo del prodotto', () => {
    expect(formatProductLabel({ product_title: ' Maglietta ', shopify_product_id: 5 })).toBe(
      'Maglietta',
    );
  });

  it('senza titolo ripiega sull\'id', () => {
    expect(formatProductLabel({ product_title: null, shopify_product_id: 5 })).toBe('Prodotto 5');
    expect(formatProductLabel({})).toBe('Prodotto senza titolo');
  });
});

# Ricerca e paginazione in "Prodotti con problemi" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare alla pagina dei prodotti con problemi una barra di ricerca, la paginazione a 20 righe, la colonna Prezzo e il pulsante in linea col titolo.

**Architecture:** Ricerca e paginazione sono lato client — le righe sono già tutte caricate dal loader. La logica sta in funzioni pure testate; la pagina è markup Polaris che le consuma.

**Tech Stack:** Remix 2, React, Shopify Polaris 13, TypeScript, Vitest.

## Global Constraints

- **Tutto in Shopify Polaris.**
- Ricerca e paginazione **lato client**: nessuna nuova chiamata a Shopify, nessuna modifica al loader.
- Il prezzo resta una **stringa** (come lo restituisce Shopify); la ricerca lo confronta come testo.
- **20 righe per pagina**, applicate alle righe già filtrate.
- Cambiando la ricerca si torna a **pagina 1**.
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla. La logica va in funzioni pure testate.
- La suite deve riportare **271 test** a inizio lavoro: se ne vedi molti meno il comando è stato interrotto, rilancialo.
- TDD sulle funzioni pure. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Il prezzo nei dati raccolti

**Files:**
- Modify: `app/lib/stats/product-readiness.ts` (interfaccia `ProblemVariant` e `collectProblemVariants`)
- Test: `app/lib/stats/product-readiness.test.ts`

**Interfaces:**
- Produces: `ProblemVariant` guadagna `price: string | null`, valorizzato da `variant.price`.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `app/lib/stats/product-readiness.test.ts`, seguendo lo stile delle fixture già presenti nel file:

```ts
  it('collectProblemVariants riporta il prezzo della variante', () => {
    const rows = collectProblemVariants([
      {
        id: 1,
        title: 'Prodotto',
        variants: [
          { id: 11, title: 'S', sku: 'A1', price: '29.90', cost: null, inventory_item_id: 111 },
        ],
      },
    ] as any);
    expect(rows[0].price).toBe('29.90');
  });

  it('collectProblemVariants mette null se il prezzo manca', () => {
    const rows = collectProblemVariants([
      {
        id: 2,
        title: 'Senza prezzo',
        variants: [{ id: 21, title: 'M', sku: null, cost: null, inventory_item_id: 211 }],
      },
    ] as any);
    expect(rows[0].price).toBeNull();
  });
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/stats/product-readiness.test.ts -t "prezzo"`
Expected: FAIL — `price` non esiste sulla riga.

- [ ] **Step 3: Implementa**

In `app/lib/stats/product-readiness.ts`, aggiungi il campo all'interfaccia:

```ts
export interface ProblemVariant {
  productId: number;
  productTitle: string;
  variantId: number;
  variantTitle: string;
  sku: string | null;
  // Prezzo come stringa, cosi' come lo restituisce Shopify: serve alla ricerca e
  // alla colonna Prezzo. Convertirlo in numero non aggiungerebbe nulla e
  // introdurrebbe arrotondamenti.
  price: string | null;
  // Serve per scrivere il costo: il cost_per_item si aggiorna sull'InventoryItem.
  inventoryItemId: number | null;
  missingField: 'cost_per_item';
}
```

e nella costruzione della riga, dopo `sku`:

```ts
        price: variant.price ?? null,
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/stats/product-readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/stats/product-readiness.ts app/lib/stats/product-readiness.test.ts
git commit -m "feat: il prezzo entra fra i dati delle varianti con problemi"
```

---

### Task 2: Filtro e paginazione, funzioni pure

**Files:**
- Create: `app/lib/stats/problem-filter.ts`
- Test: `app/lib/stats/problem-filter.test.ts`

**Interfaces:**
- Consumes: `ProblemVariant` (Task 1, con `price`).
- Produces:
  - `filterProblemVariants(rows: ProblemVariant[], query: string): ProblemVariant[]`
  - `pageCount(total: number, perPage: number): number`
  - `pageSlice<T>(rows: T[], page: number, perPage: number): T[]`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/stats/problem-filter.test.ts
import { describe, it, expect } from 'vitest';
import { filterProblemVariants, pageCount, pageSlice } from './problem-filter';
import type { ProblemVariant } from './product-readiness';

const row = (over: Partial<ProblemVariant>): ProblemVariant =>
  ({
    productId: 100,
    productTitle: 'Maglietta',
    variantId: 1,
    variantTitle: 'Rossa',
    sku: 'MAG-R',
    price: '29.90',
    inventoryItemId: 9,
    missingField: 'cost_per_item',
    ...over,
  } as ProblemVariant);

describe('filterProblemVariants', () => {
  const rows = [
    row({ variantId: 1 }),
    row({ variantId: 2, productTitle: 'Cappello', variantTitle: 'Blu', sku: 'CAP-B', price: '15.00', productId: 200 }),
  ];

  it('query vuota → tutte le righe', () => {
    expect(filterProblemVariants(rows, '')).toHaveLength(2);
    expect(filterProblemVariants(rows, '   ')).toHaveLength(2);
  });
  it('cerca nel titolo prodotto', () => {
    expect(filterProblemVariants(rows, 'cappello')).toHaveLength(1);
  });
  it('cerca nel titolo variante', () => {
    expect(filterProblemVariants(rows, 'rossa')).toHaveLength(1);
  });
  it('cerca nello SKU', () => {
    expect(filterProblemVariants(rows, 'CAP-B')).toHaveLength(1);
  });
  it("cerca nell'ID prodotto", () => {
    expect(filterProblemVariants(rows, '200')).toHaveLength(1);
  });
  it('cerca nel prezzo', () => {
    expect(filterProblemVariants(rows, '15.00')).toHaveLength(1);
  });
  it('e insensibile alle maiuscole', () => {
    expect(filterProblemVariants(rows, 'MAGLIETTA')).toHaveLength(1);
  });
  it('nessuna corrispondenza → lista vuota', () => {
    expect(filterProblemVariants(rows, 'inesistente')).toHaveLength(0);
  });
  it('sku o prezzo null non fanno esplodere il confronto', () => {
    const withNulls = [row({ sku: null, price: null })];
    expect(() => filterProblemVariants(withNulls, 'x')).not.toThrow();
    expect(filterProblemVariants(withNulls, 'maglietta')).toHaveLength(1);
  });
});

describe('pageCount', () => {
  it('nessuna riga → nessuna pagina', () => expect(pageCount(0, 20)).toBe(0));
  it('esattamente una pagina', () => expect(pageCount(20, 20)).toBe(1));
  it('una riga in piu → due pagine', () => expect(pageCount(21, 20)).toBe(2));
});

describe('pageSlice', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);
  it('prima pagina', () => expect(pageSlice(rows, 1, 20)).toHaveLength(20));
  it('ultima pagina parziale', () => expect(pageSlice(rows, 2, 20)).toEqual(rows.slice(20)));
  it('pagina oltre la fine → vuota', () => expect(pageSlice(rows, 9, 20)).toEqual([]));
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/stats/problem-filter.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/lib/stats/problem-filter.ts
import type { ProblemVariant } from './product-readiness';

// Sottostringa case-insensitive su piu' campi in OR. productId e price sono
// confrontati come TESTO: cercare "123" trova sia l'id 1234 sia il prezzo 12.30.
// E' voluto — la ricerca serve a scremare, non a filtrare in modo esatto.
export function filterProblemVariants(
  rows: ProblemVariant[],
  query: string,
): ProblemVariant[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((r) =>
    [
      r.productTitle,
      r.variantTitle,
      r.sku ?? '',
      String(r.productId),
      r.price ?? '',
    ].some((field) => field.toLowerCase().includes(q)),
  );
}

export function pageCount(total: number, perPage: number): number {
  if (total <= 0 || perPage <= 0) return 0;
  return Math.ceil(total / perPage);
}

export function pageSlice<T>(rows: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/stats/problem-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/stats/problem-filter.ts app/lib/stats/problem-filter.test.ts
git commit -m "feat: filtro e paginazione per le varianti con problemi"
```

---

### Task 3: La pagina

**Files:**
- Modify: `app/routes/products.issues.tsx`

**Interfaces:**
- Consumes: `filterProblemVariants`, `pageCount`, `pageSlice` (Task 2); `ProblemVariant.price` (Task 1).

- [ ] **Step 1: Import e costanti**

Aggiungi agli import Polaris `Pagination` (accanto a quelli già presenti) e:

```tsx
import { filterProblemVariants, pageCount, pageSlice } from '~/lib/stats/problem-filter';
```

Sopra il componente della pagina:

```tsx
const PER_PAGE = 20;
```

- [ ] **Step 2: Stato di ricerca e pagina**

Nel componente, accanto agli altri `useState`:

```tsx
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = filterProblemVariants(rows, query);
  const totalPages = pageCount(filtered.length, PER_PAGE);
  const visibleRows = pageSlice(filtered, page, PER_PAGE);

  // Cambiando la ricerca si riparte da pagina 1: restare a pagina 4 su un
  // risultato di 2 pagine mostrerebbe una tabella vuota senza spiegazione.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Le righe risolte vengono rimosse dall'elenco: se cosi' la pagina corrente
  // resta oltre la fine, si arretra.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [totalPages, page]);
```

- [ ] **Step 3: Pulsante in linea col titolo**

Sostituisci l'apertura della pagina:

```tsx
    <Page title="Prodotti con problemi" backAction={{ url: '/' }}>
```

con:

```tsx
    <Page
      title="Prodotti con problemi"
      backAction={{ url: '/' }}
      primaryAction={{
        content: 'Ricontrolla e aggiorna',
        onAction: runRecheck,
        loading: rechecking,
        disabled: !hasChanges || blocked,
      }}
    >
```

e **rimuovi** il `<Button …>Ricontrolla e aggiorna</Button>` che sta dentro la Card, insieme all'`InlineStack` che lo affiancava al testo se resta con un solo figlio (il testo può restare direttamente dentro il `<Box padding="400">`).

- [ ] **Step 4: Barra di ricerca e conteggio**

Dentro il `<Box padding="400">` della Card, sopra la tabella, al posto del solo testo descrittivo:

```tsx
              <BlockStack gap="300">
                <TextField
                  label="Cerca"
                  labelHidden
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                  placeholder="Cerca per titolo, variante, SKU, ID prodotto o prezzo"
                  clearButton
                  onClearButtonClick={() => setQuery('')}
                />
                <Text as="p" tone="subdued">
                  {filtered.length}{' '}
                  {filtered.length === 1 ? 'variante' : 'varianti'} a cui manca il valore{' '}
                  <code>cost_per_item</code>. Inserisci il costo e premi Invio (o
                  esci dal campo): viene salvato su Shopify e Supabase.
                </Text>
              </BlockStack>
```

- [ ] **Step 5: Colonna Prezzo**

Nelle `headings` della `IndexTable`, aggiungi `{ title: 'Prezzo' }` **dopo** `{ title: 'SKU' }`:

```tsx
              headings={[
                { title: 'Prodotto' },
                { title: 'Variante' },
                { title: 'SKU' },
                { title: 'Prezzo' },
                { title: 'cost_per_item' },
                { title: '' },
              ]}
```

e nel componente `CostRow`, subito **dopo** la cella dello SKU:

```tsx
      <IndexTable.Cell>{row.price ?? '—'}</IndexTable.Cell>
```

- [ ] **Step 6: Righe visibili e paginazione**

Nel `map` delle righe, sostituisci `rows.map(...)` con `visibleRows.map(...)`, e aggiorna `itemCount` della `IndexTable` a `visibleRows.length`.

Sotto la `IndexTable`, dentro la Card, aggiungi:

```tsx
            {totalPages > 1 && (
              <Box padding="400">
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => setPage((p) => p - 1)}
                    hasNext={page < totalPages}
                    onNext={() => setPage((p) => p + 1)}
                    label={`Pagina ${page} di ${totalPages}`}
                  />
                </InlineStack>
              </Box>
            )}
```

- [ ] **Step 7: Verifica**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

Verifica anche a mano che non siano rimasti import Polaris orfani (`tsc` **non** li segnala in questo progetto):

```bash
for s in Button InlineStack; do echo "--- $s"; grep -n "<$s" app/routes/products.issues.tsx; done
```

- [ ] **Step 8: Commit**

```bash
git add app/routes/products.issues.tsx
git commit -m "feat: ricerca, paginazione e colonna Prezzo nei prodotti con problemi"
```

---

## Note di verifica manuale (post-deploy)

- Cercare per titolo, SKU, ID prodotto e prezzo: la tabella si filtra e il
  conteggio sopra riflette i risultati.
- Con più di 20 righe compaiono le frecce; disabilitate su prima e ultima pagina.
- Cambiando la ricerca si torna a pagina 1.
- "Ricontrolla e aggiorna" è in alto, in linea col titolo.

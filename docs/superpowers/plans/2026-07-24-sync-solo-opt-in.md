# Sincronizzare solo i clienti opt-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La sync scrive su Supabase solo i clienti che hanno acconsentito al marketing, e il recap dello Stepper mostra quel numero invece del totale.

## Il design in breve

Decisione presa il 2026-07-24, che **affina** (non contraddice) quella precedente sul consenso:

- **Non si aggiungono** i clienti opt-out: `syncCustomers` li filtra prima di scrivere.
- **Non si rimuove** chi si disiscrive dopo essere stato sincronizzato: resta su Supabase, con lo storico e l'LTV, e il **proxy nega le letture** dei suoi dati con 403 (comportamento già in produzione).
- Il **recap dello Stepper** mostra il numero di clienti che verranno davvero scritti, cioè gli opt-in.

Ne risulta un modello coerente: la sync non introduce dati senza consenso, il proxy copre chi lo revoca dopo, e nessuno storico viene distrutto.

Il mismatch segnalato è lo stesso difetto già corretto per i prodotti: il recap leggeva `counts.customerCount`, cioè il totale a catalogo, invece di ciò che viene sincronizzato.

## Global Constraints

- Il criterio di consenso è quello già esistente: `isCustomerOptedIn` in `app/lib/stats/customer-consent-stats.ts`. **Non reimplementarlo.**
- Il filtro vale per **entrambi** i percorsi che usano `syncCustomers` (bulk e periodica): agendo dentro quella funzione si coprono entrambi.
- **Nessuna cancellazione** di clienti: `syncCustomers` resta un upsert accumulativo.
- `customersSynced` deve riflettere i clienti effettivamente scritti.
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla.
- La suite deve riportare **288 test** a inizio lavoro: se ne vedi molti meno il comando è stato interrotto, rilancialo.
- TDD. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: La sync scrive solo gli opt-in

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (funzione `syncCustomers`)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Consumes: `isCustomerOptedIn(customer: ShopifyCustomer): boolean` da `~/lib/stats/customer-consent-stats`.
- Produces: `syncCustomers` scrive e conta solo i clienti consenzienti.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `app/lib/workers/bulk-sync.test.ts`, riusando lo stile di mock già presente (ricorda: i mock Supabase devono esporre `gte` e `lt` sul `delete()`):

```ts
  it('sincronizza solo i clienti opt-in', async () => {
    const mockShop = {
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      authorization: 'ENABLED',
      currentPlan: 'pro',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        tableNameCustomers: 'customers',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'k',
        supabaseServiceRoleKey: 's',
      },
    };
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ maxProducts: null, customersSyncEnabled: true } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: 'job-1' } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);
    vi.mocked(prisma.shop.update).mockResolvedValue({} as any);

    const upserted: any[] = [];
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: () => ({
        upsert: (rows: any[]) => { upserted.push(...rows); return { error: null }; },
        delete: () => ({
          gte: vi.fn().mockReturnValue({ error: null }),
          lt: vi.fn().mockReturnValue({ error: null }),
        }),
      }),
    } as any);

    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
      getCustomers: vi.fn().mockResolvedValue({
        customers: [
          { id: 1, email: 'si@x.it', email_marketing_consent: { state: 'subscribed' } },
          { id: 2, email: 'no@x.it', email_marketing_consent: { state: 'unsubscribed' } },
          { id: 3, email: 'legacy@x.it', accepts_marketing: true },
        ],
        nextPageInfo: null,
      }),
    }) as any);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // Solo i due consenzienti (nidificato subscribed + legacy true).
    const customerIds = upserted
      .filter((r) => r.shopify_customer_id != null)
      .map((r) => r.shopify_customer_id);
    expect(customerIds).toEqual([1, 3]);
  });
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "solo i clienti opt-in"`
Expected: FAIL — viene scritto anche il cliente 2 (unsubscribed).

- [ ] **Step 3: Implementa il filtro**

In `app/lib/workers/processors.server.ts` aggiungi l'import:

```ts
import { isCustomerOptedIn } from '../stats/customer-consent-stats';
```

e dentro `syncCustomers` sostituisci:

```ts
    const rows = (customers as ShopifyCustomer[]).map(transformCustomer);
```

con:

```ts
    // Solo i consenzienti finiscono su Supabase: i dati di chi non ha acconsentito
    // al marketing non devono proprio entrare. Chi revoca DOPO essere stato
    // sincronizzato non viene rimosso (lo storico e l'LTV restano) ma le sue
    // letture sono negate dal proxy: i due meccanismi si completano.
    const rows = (customers as ShopifyCustomer[])
      .filter(isCustomerOptedIn)
      .map(transformCustomer);
```

`total += rows.length` resta invariato e conta cosi' i soli clienti scritti.

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts`
Expected: PASS (nuovo test + esistenti).

- [ ] **Step 5: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "feat: la sync scrive solo i clienti che hanno acconsentito al marketing"
```

---

### Task 2: Il recap mostra i clienti opt-in

**Files:**
- Modify: `app/routes/_index.tsx` (calcolo di `previewCustomers`)

**Interfaces:**
- Consumes: `customerStats` (già presente nel componente, da `/api/stats/customers`).

- [ ] **Step 1: Sostituisci la fonte del numero**

In `app/routes/_index.tsx`, sostituisci:

```tsx
  const previewCustomers = countsLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {counts?.customerCount ?? 0}
    </Text>
  );
```

con:

```tsx
  // Clienti opt-in, NON il totale: e' il numero che verra' davvero scritto su
  // Supabase, ora che la sync filtra i non consenzienti. Stesso criterio gia'
  // applicato ai prodotti, dove il recap mostra le varianti idonee.
  const previewCustomers = customerStatsLoading ? (
    numberSkeleton
  ) : (
    <Text as="span" variant="headingMd">
      {customerStats?.optIn ?? 0}
    </Text>
  );
```

- [ ] **Step 2: Verifica gli orfani**

`counts` resta usato da `PlanBanner`; `countsLoading` resta usato da `previewProducts`? **No**: `previewProducts` usa gia' `readinessLoading`. Verifica quindi a mano se `countsLoading` è diventato orfano (`tsc` **non** segnala gli import né le variabili inutilizzate in questo progetto):

```bash
grep -n "countsLoading\|counts?\." app/routes/_index.tsx
```

Se `countsLoading` non compare piu' in alcun uso, rimuovi la riga che lo dichiara.

- [ ] **Step 3: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 4: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "fix: il recap dello Stepper mostra i clienti opt-in, non il totale"
```

---

## Note di verifica manuale (post-deploy)

Richiede un piano con `customersSyncEnabled`:

- Il recap in "Sincronizza prodotti e clienti" mostra lo stesso numero di "Clienti opt-in" nella card.
- Dopo una sync, la tabella `customers` su Supabase contiene solo clienti consenzienti (a parte eventuali opt-out storici, sincronizzati prima di questa modifica e volutamente non rimossi).

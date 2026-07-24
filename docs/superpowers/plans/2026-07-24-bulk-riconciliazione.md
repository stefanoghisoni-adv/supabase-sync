# Bulk sync: riconciliazione invece di azzeramento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il bulk sync non svuota più la tabella prodotti: aggiorna e aggiunge le varianti idonee, poi elimina solo le righe che non devono più esserci.

**Architecture:** Marcatura e spazzata. Si annota l'istante d'inizio corsa; ogni riga toccata riceve un `synced_at` successivo; a fine scansione una sola `DELETE ... WHERE synced_at < inizio` rimuove le righe mai toccate — prodotti spariti da Shopify e varianti senza `cost_per_item`.

**Tech Stack:** TypeScript, Supabase JS (PostgREST), Prisma, Vitest.

## Global Constraints

- **La tabella prodotti non deve mai restare vuota** durante la sync: nessuna cancellazione preventiva.
- La spazzata avviene **solo dopo una scansione terminata regolarmente**. Se una pagina di Shopify lancia, non si cancella nulla.
- Il raggiungimento del tetto del piano (`isProductLimitReached`) è una terminazione **regolare**: la spazzata va comunque eseguita.
- Un errore della sola spazzata **non** deve far fallire la sync (le righe obsolete restano fino alla corsa successiva): `console.warn`, non `throw`.
- **Nessuna modifica ai clienti** (`syncCustomers` resta un upsert accumulativo) né alla sync periodica.
- TDD. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.
- Nota ambiente: la suite gira con `pool: 'forks'` e deve riportare **252 test** a inizio lavoro. Se ne vedi molti meno il comando è stato interrotto: rilancialo.

---

### Task 1: Togliere l'azzeramento e annotare l'inizio corsa

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (funzione `processInitialBulkSync`)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Produces: `processInitialBulkSync` non esegue più alcuna cancellazione totale; la variabile locale `runStartedAt` (ISO string) è disponibile per il Task 2.

- [ ] **Step 1: Scrivi il test che fallisce**

In `app/lib/workers/bulk-sync.test.ts`, i mock di Supabase esistenti espongono `delete().gte(...)`. Aggiungi un caso che verifica che quella strada non venga più percorsa. Estratto rilevante (riusa lo stile di mock già presente nel file per shop/plan/job):

```ts
  it('non azzera piu la tabella prodotti', async () => {
    const mockShop = {
      id: 'shop-1',
      shopDomain: 'test-shop.myshopify.com',
      accessToken: 'encrypted-token',
      authorization: 'ENABLED',
      currentPlan: 'free',
      supabaseConfig: {
        syncEnabled: true,
        tableNameProducts: 'products',
        tableNameCustomers: 'customers',
        supabaseUrl: 'https://test.supabase.co',
        supabasePublicKey: 'k',
        supabaseServiceRoleKey: 's',
      },
    };
    (prisma.shop.findUnique as any).mockResolvedValue(mockShop);
    (prisma.plan.findUnique as any).mockResolvedValue({ maxProducts: null, customersSyncEnabled: false });
    (prisma.syncJob.create as any).mockResolvedValue({ id: 'job-1' });
    (prisma.syncJob.update as any).mockResolvedValue({});

    const deleteCalls: { method: string; args: any[] }[] = [];
    const supabaseMock = {
      from: () => ({
        delete: () => ({
          gte: async (...a: any[]) => { deleteCalls.push({ method: 'gte', args: a }); return { error: null }; },
          lt: async (...a: any[]) => { deleteCalls.push({ method: 'lt', args: a }); return { error: null }; },
        }),
        upsert: async () => ({ error: null }),
      }),
    };
    (createSupabaseClient as any).mockReturnValue(supabaseMock);
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
    }));

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // L'azzeramento totale passava da delete().gte('shopify_product_id', 0).
    expect(deleteCalls.some((c) => c.method === 'gte')).toBe(false);
  });
```

**Importante:** tutti i mock Supabase già presenti nel file devono esporre anche `lt` (oltre a `gte`), altrimenti il Task 2 li farà fallire con "lt is not a function". Aggiungilo ovunque ci sia `delete: () => ({ gte: ... })`.

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "non azzera"`
Expected: FAIL — l'azzeramento viene ancora eseguito.

- [ ] **Step 3: Rimuovi l'azzeramento e annota l'inizio corsa**

In `processInitialBulkSync`, sostituisci l'intero blocco:

```ts
    // Ripopolamento "da 0" dei prodotti: azzeriamo la tabella prima di
    // ripopolarla, così riflette esattamente il catalogo Shopify corrente
    // (nessun prodotto obsoleto). I CLIENTI non vengono azzerati: la loro sync
    // è upsert accumulativo (LTV storico preservato, nuovi clienti aggiunti).
    const { error: clearError } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .delete()
      .gte('shopify_product_id', 0);
    if (clearError) {
      throw new Error(`Supabase products clear failed: ${clearError.message}`);
    }
```

con:

```ts
    // Riconciliazione, non ripopolamento da zero: la tabella NON viene svuotata,
    // cosi' resta leggibile per tutta la sync (con l'azzeramento il tracciamento
    // leggeva zero prodotti per l'intera durata) e non si distrugge nulla su un
    // progetto gia' popolato. Le righe non toccate da questa corsa vengono
    // spazzate alla fine confrontando `synced_at` con questo istante.
    const runStartedAt = new Date().toISOString();
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts`
Expected: PASS (nuovo test + quelli esistenti).

- [ ] **Step 5: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi. Nota: `runStartedAt` non e' ancora usato — il Task 2 lo consuma.

- [ ] **Step 6: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "feat: il bulk non azzera piu la tabella prodotti"
```

---

### Task 2: Spazzata delle righe non toccate

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (funzione `processInitialBulkSync`)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Consumes: `runStartedAt` (Task 1).
- Produces: dopo una scansione completa il bulk esegue `delete().lt('synced_at', runStartedAt)`.

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in `app/lib/workers/bulk-sync.test.ts` (stesso stile di mock del Task 1, con `deleteCalls` che registra sia `gte` sia `lt`):

```ts
  it('spazza le righe non toccate dopo una scansione completa', async () => {
    // ... stesso setup del test "non azzera piu la tabella prodotti" ...
    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    const sweep = deleteCalls.find((c) => c.method === 'lt');
    expect(sweep).toBeDefined();
    expect(sweep!.args[0]).toBe('synced_at');
  });

  it('non spazza nulla se la scansione fallisce a meta', async () => {
    // ... stesso setup, ma getProducts lancia alla seconda pagina:
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi
        .fn()
        .mockResolvedValueOnce({ products: [{ id: 1 }], nextPageInfo: 'p2' })
        .mockRejectedValueOnce(new Error('Shopify API error')),
    }));

    await expect(
      processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any),
    ).rejects.toThrow();

    // Nessuna cancellazione: meglio righe obsolete che perdere prodotti veri.
    expect(deleteCalls.some((c) => c.method === 'lt')).toBe(false);
  });

  it('spazza anche quando si raggiunge il tetto del piano', async () => {
    // ... stesso setup ma con piano limitato e piu' prodotti del tetto:
    (prisma.plan.findUnique as any).mockResolvedValue({ maxProducts: 1, customersSyncEnabled: false });
    (ShopifyAPIClient as any).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [{ id: 1 }, { id: 2 }], nextPageInfo: 'p2' }),
    }));
    (transformProduct as any).mockImplementation((p: any) => [
      { shopify_product_id: p.id, shopify_variant_id: p.id * 10, cost_per_item: 5 },
    ]);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // Il tetto e' una terminazione regolare: la spazzata deve avvenire.
    expect(deleteCalls.some((c) => c.method === 'lt')).toBe(true);
  });
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "spazza"`
Expected: FAIL — la spazzata non esiste ancora.

- [ ] **Step 3: Implementa la spazzata**

In `processInitialBulkSync`, **subito dopo** la chiusura del ciclo `} while (nextPageInfo);` e **prima** del blocco che sincronizza i clienti, inserisci:

```ts
    // Spazzata: le righe con synced_at anteriore all'inizio corsa sono quelle che
    // la scansione non ha toccato, cioe' esattamente le due categorie da togliere
    // — prodotti non piu' presenti su Shopify e varianti che hanno perso il
    // cost_per_item. Una sola query, indipendente dal numero di prodotti.
    //
    // Sta QUI di proposito: ci si arriva solo se la paginazione e' terminata
    // regolarmente (anche per raggiunto tetto del piano). Se una pagina lancia,
    // il controllo salta al catch e non si cancella nulla: meglio qualche riga
    // obsoleta che perdere prodotti veri per un errore di rete.
    //
    // Le righe con synced_at NULL sopravvivono (in SQL un confronto con NULL non
    // e' mai vero): non le ha scritte l'app, non le tocchiamo.
    const { error: sweepError } = await supabase
      .from(shop.supabaseConfig.tableNameProducts)
      .delete()
      .lt('synced_at', runStartedAt);

    if (sweepError) {
      // Non fatale: i prodotti idonei sono gia' stati scritti. Le righe obsolete
      // verranno rimosse alla corsa successiva.
      console.warn('Spazzata dei prodotti obsoleti fallita:', sweepError);
    }
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts`
Expected: PASS (tutti i test del file).

- [ ] **Step 5: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "feat: spazzata delle righe prodotto non piu presenti o non idonee"
```

---

## Note di verifica manuale (post-deploy)

- Lanciare un sync manuale e osservare che la tabella prodotti **non si svuota mai**
  (interrogandola dal proxy durante la sync si continuano a leggere righe).
- Togliere il `cost_per_item` a una variante su Shopify, lanciare un sync manuale:
  quella riga sparisce da Supabase.
- Archiviare/eliminare un prodotto su Shopify, lanciare un sync manuale: le sue
  righe spariscono da Supabase.

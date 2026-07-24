# Propagazione della revoca del consenso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Nessun dato senza consenso entra su Supabase, e chi revoca il consenso dopo essere stato sincronizzato viene comunque marcato `accepts_marketing = false` sulla riga già esistente, così il proxy continua a negarne le letture con 403.

## Il difetto da correggere

Il proxy (`app/routes/rest.v1.$table.tsx`) decide se negare una lettura leggendo la colonna `accepts_marketing` **della riga su Supabase**, non interrogando Shopify. Quel controllo vale quindi solo quanto è aggiornata la colonna.

Il commit `49b0a6d` ha aggiunto a `syncCustomers` un `.filter(isCustomerOptedIn)` prima dell'upsert. Corretto nell'intento (non far entrare dati senza consenso) ma con un effetto collaterale: chi **revoca dopo** essere stato sincronizzato viene ora scartato dalla sync, quindi la sua riga conserva `accepts_marketing = true` e **il proxy continua a servirne i dati**. Prima del filtro la sync periodica riscriveva quella riga e la colonna diventava `false`.

Il webhook `customers/update` copre il caso normale, ma i suoi errori vengono loggati e restituiti come 200 senza ritentativi: la sync periodica era la rete di sicurezza, e va ripristinata.

## La regola, in due righe

- Cliente **consenziente** → `upsert` della riga completa (come oggi).
- Cliente **non consenziente** → `update` (mai `upsert`, mai `insert`) di `accepts_marketing = false` sulla riga con quello `shopify_customer_id`. Se la riga non esiste, PostgREST non tocca nulla: nessun dato nuovo entra.

## Global Constraints

- Il criterio di consenso è `isCustomerOptedIn` in `app/lib/stats/customer-consent-stats.ts`. **Non reimplementarlo.**
- **Nessuna cancellazione** di clienti: lo storico e l'LTV restano.
- `customersSynced` / `total` continua a contare i soli clienti **scritti per intero** (gli opt-in), non i marcati.
- La update dei non consenzienti scrive **solo** `accepts_marketing: false`. Non toccare `synced_at` né altri campi: non stiamo sincronizzando quel cliente, stiamo solo revocandogli l'accesso.
- Un errore sulla update di revoca **non** deve far fallire la sync degli opt-in: logga con `console.warn` e prosegui (stesso criterio della spazzata prodotti, `processors.server.ts:458`).
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla.
- La suite riporta **289 test** a inizio lavoro. Se ne vedi molti meno il comando è stato interrotto: rilancialo.
- TDD. `npx vitest run`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: `syncCustomers` propaga la revoca

**Files:**
- Modify: `app/lib/workers/processors.server.ts` (funzione `syncCustomers`, righe ~26-70)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Consumes: `isCustomerOptedIn(customer: ShopifyCustomer): boolean`.
- Produces: `syncCustomers` upserta gli opt-in e marca `accepts_marketing = false` i non opt-in già presenti.

- [ ] **Step 1: Scrivi il test che fallisce**

In `app/lib/workers/bulk-sync.test.ts`, accanto al test `'sincronizza solo i clienti opt-in'` già presente, aggiungine uno che verifica la marcatura. Il mock Supabase deve registrare le chiamate `update(...).in(...)`:

```ts
  it('marca accepts_marketing=false sui clienti che hanno revocato, senza inserirli', async () => {
    // ... stesso setup di 'sincronizza solo i clienti opt-in' (mockShop, plan,
    // syncJob, shop.update) ...

    const upserted: any[] = [];
    const revokedUpdates: Array<{ payload: any; ids: any }> = [];
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: () => ({
        upsert: (rows: any[]) => { upserted.push(...rows); return { error: null }; },
        update: (payload: any) => ({
          in: (_col: string, ids: any) => {
            revokedUpdates.push({ payload, ids });
            return { error: null };
          },
        }),
        delete: () => ({
          gte: vi.fn().mockReturnValue({ error: null }),
          lt: vi.fn().mockReturnValue({ error: null }),
        }),
      }),
    } as any);

    // getCustomers restituisce 1 subscribed e 2 unsubscribed (ids 2 e 4).

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    // I revocanti NON finiscono nell'upsert...
    expect(upserted.map((r) => r.shopify_customer_id).filter((v) => v != null)).toEqual([1]);
    // ...ma vengono marcati in una sola chiamata.
    expect(revokedUpdates).toHaveLength(1);
    expect(revokedUpdates[0].payload).toEqual({ accepts_marketing: false });
    expect(revokedUpdates[0].ids).toEqual([2, 4]);
  });
```

Aggiorna anche il mock del test `'sincronizza solo i clienti opt-in'` esistente perché esponga `update`, altrimenti fallirà quando la nuova implementazione lo invocherà.

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "revocato"`
Expected: FAIL — `update` non viene mai chiamata.

- [ ] **Step 3: Implementa**

In `syncCustomers`, sostituisci il blocco che oggi calcola `rows`:

```ts
    const rows = (customers as ShopifyCustomer[])
      .filter(isCustomerOptedIn)
      .map(transformCustomer);
```

con la separazione dei due insiemi (adatta i nomi allo stile del file):

```ts
    // Due destini diversi per due categorie diverse.
    const page = customers as ShopifyCustomer[];
    const rows = page.filter(isCustomerOptedIn).map(transformCustomer);
    const revokedIds = page.filter((c) => !isCustomerOptedIn(c)).map((c) => c.id);
```

L'upsert dei `rows` resta identico. Dopo di esso, prima di `total += rows.length`, aggiungi la marcatura:

```ts
    // Chi non ha acconsentito non entra: nessuna insert. Ma se una riga sua e'
    // gia' su Supabase — sincronizzata quando il consenso c'era — va marcata,
    // perche' il proxy decide il 403 leggendo proprio questa colonna. Una
    // `update` non crea righe: sui clienti mai sincronizzati e' un no-op.
    if (revokedIds.length > 0) {
      const { error: revokeError } = await supabase
        .from(tableName)
        .update({ accepts_marketing: false })
        .in('shopify_customer_id', revokedIds);

      if (revokeError) {
        // Non fatale: gli opt-in sono gia' scritti, la corsa successiva ritenta.
        console.warn('Marcatura dei consensi revocati fallita:', revokeError.message);
      }
    }
```

`total += rows.length` resta invariato: conta i soli clienti scritti.

- [ ] **Step 4: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi, 291 test.

- [ ] **Step 5: Commit**

```bash
git add app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "fix(security): la sync marca accepts_marketing=false su chi ha revocato il consenso"
```

---

### Task 2: Il webhook clienti non inserisce i non consenzienti

**Files:**
- Modify: `app/routes/webhooks.customers.create.tsx` (usato anche da `webhooks.customers.update.tsx` via re-export)
- Test: `app/routes/webhooks.customers.test.ts` (nuovo)

**Interfaces:**
- Consumes: `isCustomerOptedIn`, `transformCustomer`.
- Produces: l'action upserta i consenzienti e marca i non consenzienti senza crearli.

**Contesto:** `webhooks.customers.update.tsx` è un semplice `export { action } from './webhooks.customers.create'`, quindi una sola modifica copre creazione e aggiornamento. Oggi l'action fa `upsert(transformCustomer(customer))` per chiunque: un cliente che non ha mai acconsentito entra comunque su Supabase (con `accepts_marketing = false`), contro la regola "nessun dato senza consenso".

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `app/routes/webhooks.customers.test.ts` modellandolo su `app/routes/webhooks.products.test.ts` (riusa il suo modo di mockare `verifyWebhook`, `prisma` e `createSupabaseClient`, e il suo modo di costruire la `Request` con gli header `X-Shopify-Hmac-Sha256` e `X-Shopify-Shop-Domain`).

Tre casi:

1. `email_marketing_consent.state === 'subscribed'` → viene chiamata `upsert` con la riga completa, `update` mai.
2. `email_marketing_consent.state === 'unsubscribed'` → `upsert` mai chiamata; viene chiamata `update({ accepts_marketing: false })` filtrata con `eq('shopify_customer_id', <id>)`.
3. In entrambi i casi la risposta è 200.

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/routes/webhooks.customers.test.ts`
Expected: FAIL sul caso 2 — oggi viene fatto un upsert.

- [ ] **Step 3: Implementa**

In `app/routes/webhooks.customers.create.tsx`, aggiungi l'import:

```ts
import { isCustomerOptedIn } from '~/lib/stats/customer-consent-stats';
```

e sostituisci il blocco `const row = transformCustomer(customer);` + `upsert` con la biforcazione. Chi non ha acconsentito non viene inserito, ma se una riga sua esiste gia' la colonna del consenso va aggiornata, perche' e' quella che il proxy legge per rispondere 403:

```ts
    const supabase = createSupabaseClient(shop.supabaseConfig);
    const table = shop.supabaseConfig.tableNameCustomers;

    // Consenziente: riga completa. Non consenziente: nessuna insert, solo la
    // marcatura della colonna su cui il proxy decide il 403 (no-op se il cliente
    // non era mai stato sincronizzato).
    const { error } = isCustomerOptedIn(customer)
      ? await supabase.from(table).upsert(transformCustomer(customer), {
          onConflict: 'shopify_customer_id',
          ignoreDuplicates: false,
        })
      : await supabase
          .from(table)
          .update({ accepts_marketing: false })
          .eq('shopify_customer_id', customer.id);
```

Il resto della funzione (gestione `error`, `syncJob.create`, risposta) resta invariato. Lascia `customersSynced: 1` così com'è.

- [ ] **Step 4: Verifica completa**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add app/routes/webhooks.customers.create.tsx app/routes/webhooks.customers.test.ts
git commit -m "fix(security): il webhook clienti non inserisce chi non ha acconsentito"
```

---

## Note di verifica manuale (post-deploy)

Richiede un piano con `customersSyncEnabled`:

- Togliere il consenso marketing a un cliente già sincronizzato, attendere il webhook, poi `curl` al proxy con `?email=eq.<sua-email>` → 403 "L'utente non ha acconsentito al marketing su Shopify".
- Su Supabase, la riga di quel cliente esiste ancora (storico e LTV intatti) con `accepts_marketing = false`.
- Un cliente creato su Shopify senza consenso non compare affatto nella tabella `customers`.

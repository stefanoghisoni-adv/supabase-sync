# Sblocco della sync dopo l'upgrade di piano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al cambio di piano il pulsante di sincronizzazione torna abilitato, cambia etichetta e un banner spiega cosa succederà ai prodotti.

**Architecture:** Un solo segnale persistente — il piano con cui è stata eseguita l'ultima sync — governa sia il pulsante sia il banner. L'azione di sync non cambia: il bulk riconciliativo già rispetta il tetto del piano corrente e sincronizza i clienti se inclusi.

**Tech Stack:** Remix 2, React, Shopify Polaris 13, TypeScript, Prisma, Vitest.

## Global Constraints

- **Tutto in Shopify Polaris.**
- L'azione di sincronizzazione **non va modificata**: il pulsante continua a innescare la stessa `action` esistente.
- Etichetta **verbatim** quando il piano è cambiato e include i clienti: `Sincronizza clienti`.
- Il banner dipende dalla **stessa condizione** del pulsante (piano corrente ≠ piano dell'ultima sync), con un **pavimento di 2 minuti lato client**: una volta apparso non sparisce prima, anche se la sync finisce subito.
- Direzione determinata dal **tetto prodotti** (`maxProducts`, `null` = illimitato): sale → banner `success`; scende → banner `warning`.
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla. La logica sta in funzioni pure testate.
- La suite deve riportare **256 test** a inizio lavoro: se ne vedi molti meno il comando è stato interrotto, rilancialo.
- TDD sulle funzioni pure. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Funzioni pure di stato del piano

**Files:**
- Create: `app/components/Dashboard/plan-upgrade.ts`
- Test: `app/components/Dashboard/plan-upgrade.test.ts`

**Interfaces:**
- Produces:
  - `hasPlanChanged(currentPlan: string, lastSyncedPlan: string | null): boolean`
  - `syncButtonLabel(opts: { planChanged: boolean; customersEnabled: boolean }): string`
  - `planChangeBanner(opts: { currentMax: number | null; previousMax: number | null; customersEnabled: boolean }): { tone: 'success' | 'warning'; title: string; message: string }`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/components/Dashboard/plan-upgrade.test.ts
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
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/components/Dashboard/plan-upgrade.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/components/Dashboard/plan-upgrade.ts

// `lastSyncedPlan` null significa "nessuna sync completata": e' il flusso normale
// di primo utilizzo, non un cambio di piano da segnalare.
export function hasPlanChanged(
  currentPlan: string,
  lastSyncedPlan: string | null,
): boolean {
  if (!lastSyncedPlan) return false;
  return currentPlan !== lastSyncedPlan;
}

export function syncButtonLabel(opts: {
  planChanged: boolean;
  customersEnabled: boolean;
}): string {
  // Dopo un cambio di piano l'etichetta comunica il beneficio principale
  // dell'upgrade, anche se l'azione recupera pure i prodotti oltre il vecchio tetto.
  if (opts.planChanged && opts.customersEnabled) return 'Sincronizza clienti';
  if (opts.customersEnabled && !opts.planChanged) return 'Sincronizza prodotti e clienti';
  return 'Sincronizza prodotti';
}

// null = illimitato: per i confronti vale come infinito.
function cap(v: number | null): number {
  return v == null ? Number.POSITIVE_INFINITY : v;
}

function capLabel(v: number | null): string {
  return v == null ? 'senza limite' : String(v);
}

export function planChangeBanner(opts: {
  currentMax: number | null;
  previousMax: number | null;
  customersEnabled: boolean;
}): { tone: 'success' | 'warning'; title: string; message: string } {
  const isDowngrade = cap(opts.currentMax) < cap(opts.previousMax);

  if (isDowngrade) {
    return {
      tone: 'warning',
      title: 'Piano modificato',
      message:
        `Alcuni prodotti verranno rimossi per rispettare il limite del piano: ` +
        `${capLabel(opts.currentMax)} prodotti sincronizzabili.`,
    };
  }

  const clienti = opts.customersEnabled
    ? ' Ora è disponibile anche una nuova tabella per i clienti che hanno acconsentito al marketing.'
    : '';

  return {
    tone: 'success',
    title: 'Piano aggiornato',
    message:
      `La sincronizzazione rispetterà automaticamente i nuovi limiti del piano: ` +
      `${capLabel(opts.currentMax)} prodotti sincronizzabili.${clienti}`,
  };
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/components/Dashboard/plan-upgrade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/plan-upgrade.ts app/components/Dashboard/plan-upgrade.test.ts
git commit -m "feat: funzioni pure per stato e messaggi del cambio piano"
```

---

### Task 2: Memorizzare il piano dell'ultima sync

**Files:**
- Modify: `prisma/schema.prisma` (campo su `Shop`)
- Create: `prisma/migrations/20260724180000_add_last_synced_plan/migration.sql`
- Modify: `app/lib/workers/processors.server.ts` (`processInitialBulkSync`)
- Test: `app/lib/workers/bulk-sync.test.ts`

**Interfaces:**
- Produces: campo Prisma `Shop.lastSyncedPlan` (`String?`, colonna `last_synced_plan`), scritto al completamento del bulk.

- [ ] **Step 1: Aggiungi il campo Prisma**

In `prisma/schema.prisma`, nel model `Shop`, subito dopo `ianaTimezone`:

```prisma
  // Piano con cui e' stata eseguita l'ultima sync completata. Confrontandolo con
  // currentPlan si capisce se il piano e' cambiato e c'e' altro da sincronizzare.
  lastSyncedPlan    String?            @map("last_synced_plan")
  // Istante in cui il banner di cambio piano e' stato mostrato la prima volta:
  // garantisce che non riappaia dopo la chiusura dell'app.
  planBannerShownAt DateTime?          @map("plan_banner_shown_at")
```

- [ ] **Step 2: Crea la migration**

```sql
-- prisma/migrations/20260724180000_add_last_synced_plan/migration.sql
-- last_synced_plan: piano dell'ultima sync completata, guida il riabilitarsi del
-- pulsante e il banner di cambio piano.
-- plan_banner_shown_at: il banner e' gia' stato mostrato una volta, non deve
-- riapparire alla riapertura dell'app.
-- IF NOT EXISTS perche' sul DB owner vengono applicate a mano (il pooler non
-- esegue DDL).
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "last_synced_plan" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "plan_banner_shown_at" TIMESTAMP;
```

- [ ] **Step 3: Scrivi il test che fallisce**

In `app/lib/workers/bulk-sync.test.ts`, aggiungi (riusando lo stile di mock già presente, e ricordando che i mock Supabase devono esporre `gte` e `lt`):

```ts
  it('registra il piano usato quando la sync si completa', async () => {
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
    vi.mocked(prisma.plan.findUnique).mockResolvedValue({ maxProducts: null, customersSyncEnabled: false } as any);
    vi.mocked(prisma.syncJob.create).mockResolvedValue({ id: 'job-1' } as any);
    vi.mocked(prisma.syncJob.update).mockResolvedValue({} as any);
    vi.mocked(prisma.shop.update).mockResolvedValue({} as any);

    const mockGte = vi.fn().mockReturnValue({ error: null });
    const mockLt = vi.fn().mockReturnValue({ error: null });
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: () => ({
        upsert: vi.fn().mockReturnValue({ error: null }),
        delete: () => ({ gte: mockGte, lt: mockLt }),
      }),
    } as any);
    vi.mocked(ShopifyAPIClient).mockImplementation(() => ({
      getProducts: vi.fn().mockResolvedValue({ products: [], nextPageInfo: null }),
    }) as any);

    await processInitialBulkSync('shop-1', { updateProgress: vi.fn() } as any);

    expect(prisma.shop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shop-1' },
        data: expect.objectContaining({ lastSyncedPlan: 'pro' }),
      }),
    );
  });
```

**Nota:** il mock di `prisma` in cima al file potrebbe non esporre `shop.update`. Se manca, aggiungilo alla factory `vi.mock('../../db.server', ...)`.

- [ ] **Step 4: Verifica il fallimento**

Run: `npx vitest run app/lib/workers/bulk-sync.test.ts -t "registra il piano"`
Expected: FAIL — `lastSyncedPlan` non viene mai scritto.

- [ ] **Step 5: Scrivi il piano a completamento**

In `processInitialBulkSync`, **subito dopo** il blocco che marca il job come `completed` (`prisma.syncJob.update` con `status: 'completed'`), aggiungi:

```ts
    // Il piano con cui questa sync e' stata eseguita: se in futuro currentPlan
    // differisce, la dashboard sa che c'e' altro da sincronizzare e riabilita il
    // pulsante. Si riallinea da solo a ogni sync completata.
    await prisma.shop.update({
      where: { id: shop.id },
      data: { lastSyncedPlan: shop.currentPlan },
    });
```

- [ ] **Step 6: Rigenera il client e verifica**

Run: `npx prisma generate && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260724180000_add_last_synced_plan/migration.sql app/lib/workers/processors.server.ts app/lib/workers/bulk-sync.test.ts
git commit -m "feat: memorizza il piano dell'ultima sync completata"
```

---

### Task 3: Pulsante e banner nella dashboard

**Files:**
- Modify: `app/routes/_index.tsx` (loader e componente)

**Interfaces:**
- Consumes: `hasPlanChanged`, `syncButtonLabel`, `planChangeBanner` (Task 1); `Shop.lastSyncedPlan` (Task 2).

- [ ] **Step 1: Esponi i dati nel loader**

In `app/routes/_index.tsx`, nel loader, dopo il recupero di `plan`, aggiungi il recupero del piano precedente e il calcolo:

```ts
    // Piano dell'ultima sync: serve a capire se c'e' altro da sincronizzare e a
    // dire, nel banner, se il tetto prodotti e' salito o sceso.
    const planChanged = hasPlanChanged(shop.currentPlan, shop.lastSyncedPlan);
    const previousPlan = planChanged && shop.lastSyncedPlan
      ? await prisma.plan.findUnique({ where: { planName: shop.lastSyncedPlan } })
      : null;
```

e aggiungi al `return json({...})`:

```ts
      planChanged,
      currentMaxProducts: plan?.maxProducts ?? null,
      previousMaxProducts: previousPlan?.maxProducts ?? null,
```

Aggiungi l'import:

```ts
import { hasPlanChanged, syncButtonLabel, planChangeBanner } from '~/components/Dashboard/plan-upgrade';
```

- [ ] **Step 2: Sblocca il pulsante e cambia etichetta**

Nel componente, aggiungi `planChanged`, `currentMaxProducts`, `previousMaxProducts` alla destrutturazione di `useLoaderData`.

Sostituisci:

```tsx
  const syncDisabled = blocked || inProgress || syncCompleted;
```

con:

```tsx
  // A sync completata il pulsante resta disabilitato FINCHE' il piano non cambia:
  // al cambio c'e' altro da sincronizzare (clienti e/o prodotti oltre il vecchio
  // tetto), quindi torna disponibile. Dopo la nuova sync lastSyncedPlan si
  // riallinea e il pulsante si ridisabilita da solo.
  const syncDisabled = blocked || inProgress || (syncCompleted && !planChanged);
```

Sostituisci il calcolo di `syncTitle`:

```tsx
  const syncTitle = customersEnabled
    ? 'Sincronizza prodotti e clienti'
    : 'Sincronizza prodotti';
```

con:

```tsx
  const syncTitle = syncButtonLabel({ planChanged, customersEnabled });
```

- [ ] **Step 3: Segna nel loader la prima comparsa**

Nel loader, dopo il calcolo di `planChanged`, aggiungi:

```ts
    // Il banner si mostra una volta sola nella vita del negozio: lo si marca qui,
    // al primo render che lo mostrerebbe, cosi' alla riapertura dell'app non
    // torna. Dentro la sessione resta vivo grazie al sessionStorage lato client.
    const bannerFirstShow = planChanged && shop.planBannerShownAt == null;
    if (bannerFirstShow) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { planBannerShownAt: new Date() },
      });
    }
```

e aggiungi `bannerFirstShow` al `return json({...})`.

- [ ] **Step 4: Banner con ciclo di vita a sessione**

Nel componente, aggiungi `bannerFirstShow` alla destrutturazione di `useLoaderData` e, prima del `return`:

```tsx
  // Ciclo di vita del banner:
  // - sessionStorage lo tiene vivo navigando fra le tab (stessa iframe) e muore
  //   con la chiusura di app/Shopify, che e' esattamente il comportamento voluto;
  // - il flag persistente scritto dal loader impedisce che torni alla riapertura.
  // Nessuno dei due meccanismi da solo soddisfa entrambe le richieste.
  const BANNER_KEY = 'planChangeBannerShownAt';
  const FLOOR_MS = 120_000;

  const [bannerAt, setBannerAt] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const stored = sessionStorage.getItem(BANNER_KEY);
    if (stored) {
      setBannerAt(Number(stored));
      return;
    }
    if (bannerFirstShow) {
      const now = Date.now();
      sessionStorage.setItem(BANNER_KEY, String(now));
      setBannerAt(now);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al superamento dei 2 minuti il banner diventa chiudibile: serve un re-render
  // al momento giusto, altrimenti la X comparirebbe solo alla prossima
  // interazione.
  useEffect(() => {
    if (bannerAt === null) return;
    const remaining = FLOOR_MS - (Date.now() - bannerAt);
    if (remaining <= 0) return;
    const id = setTimeout(() => forceTick((n) => n + 1), remaining);
    return () => clearTimeout(id);
  }, [bannerAt]);

  const showPlanBanner = bannerAt !== null && !bannerDismissed;
  const bannerClosable = bannerAt !== null && Date.now() - bannerAt >= FLOOR_MS;
  const planBanner = planChangeBanner({
    currentMax: currentMaxProducts,
    previousMax: previousMaxProducts,
    customersEnabled,
  });
```

Poi, nel JSX, **in cima alla dashboard, sopra le card** (accanto agli altri banner di stato già presenti), inserisci:

```tsx
        {showPlanBanner && (
          <Banner
            tone={planBanner.tone}
            title={planBanner.title}
            onDismiss={bannerClosable ? () => setBannerDismissed(true) : undefined}
          >
            <Text as="p">{planBanner.message}</Text>
          </Banner>
        )}
```

`onDismiss` assente nei primi 2 minuti: Polaris non renderizza la X se non c'è un gestore, quindi il banner risulta non chiudibile senza alcun codice aggiuntivo.

- [ ] **Step 5: Verifica completa**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: pulsante sbloccato e banner al cambio di piano"
```

---

## Nota per il deploy

La migration aggiunge una colonna alla tabella `shops` del database **owner**. Il
pooler non esegue DDL: va lanciata a mano nel SQL editor di Supabase **prima** del
deploy, altrimenti Prisma la selezionerebbe in ogni query su `shops` facendole
fallire tutte.

```sql
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "last_synced_plan" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "plan_banner_shown_at" TIMESTAMP;
```

## Note di verifica manuale (post-deploy)

- Cambiare `current_plan` sul DB owner da `free` a un piano superiore: alla
  riapertura della dashboard il pulsante è di nuovo attivo, si chiama
  `Sincronizza clienti` e compare il banner verde col nuovo limite.
- Lanciare la sync: a completamento il banner sparisce (dopo i 2 minuti) e il
  pulsante si ridisabilita.
- Riportare il piano a `free`: compare il banner arancione che avvisa della
  rimozione dei prodotti eccedenti.

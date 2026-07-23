# Log di sincronizzazione e riordino Stepper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare lo Stepper a metà larghezza a sinistra e affiancargli a destra un Log di sincronizzazione a tre colonne, che registra anche la creazione delle tabelle sul Supabase del merchant.

**Architecture:** La logica sta in funzioni pure testate; il componente è markup Polaris. La creazione tabelle viene rilevata confrontando lo schema del merchant prima e dopo la DDL, e registrata come `SyncJob` con un `jobType` che codifica cosa è stato creato (nessuna migrazione).

**Tech Stack:** Remix 2, React, Shopify Polaris 13, TypeScript, Vitest, Prisma, Supabase Management API.

## Global Constraints

- **Tutto in Shopify Polaris.** Niente `div` con stile inline né CSS custom.
- Interfaccia **in italiano** (il componente attuale è in inglese e va tradotto).
- Testi badge creazione tabelle **verbatim**: `Creazione tabella prodotti riuscita`, `Creazione tabella clienti riuscita`, `Creazione tabelle prodotti e clienti riuscita`.
- Etichette stato sync **verbatim**: `Completata`, `Fallita`, `In corso`.
- I numeri stanno **solo nella terza colonna**; la colonna data/ora contiene data, ora e durata. Per le righe di creazione tabella la terza colonna è **vuota**.
- Il numero di prodotti mostrato è `variantsSynced` (varianti idonee); i clienti (`customersSynced`) solo se il piano li include.
- La registrazione del log è **best effort**: non deve mai far fallire il collegamento a Supabase.
- **Non esiste infrastruttura per test di componenti React** (niente jsdom/testing-library): non aggiungerla. I componenti si verificano con `tsc` e `build`.
- TDD sulle funzioni pure. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Funzioni di formattazione del log

**Files:**
- Create: `app/components/Dashboard/sync-log-format.ts`
- Test: `app/components/Dashboard/sync-log-format.test.ts`

**Interfaces:**
- Produces: `tableCreationMessage(jobType: string): string | null`, `syncStatusBadge(status: string): { tone: 'success' | 'critical' | 'info'; label: string }`, `formatDuration(startedAt: string, completedAt: string | null): string | null`, `formatDateTime(iso: string): string`, `syncRowNumbers(job: { jobType: string; variantsSynced: number; customersSynced: number }, customersEnabled: boolean): string`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/components/Dashboard/sync-log-format.test.ts
import { describe, it, expect } from 'vitest';
import {
  tableCreationMessage,
  syncStatusBadge,
  formatDuration,
  formatDateTime,
  syncRowNumbers,
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
  it('formato giorno/mese/anno ora:minuti', () => {
    // Costruito in ora locale per non dipendere dal fuso della macchina.
    const iso = new Date(2026, 6, 24, 14, 5).toISOString();
    expect(formatDateTime(iso)).toBe('24/07/2026 14:05');
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
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/components/Dashboard/sync-log-format.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/components/Dashboard/sync-log-format.ts

const TABLE_CREATION_MESSAGES: Record<string, string> = {
  table_create_products: 'Creazione tabella prodotti riuscita',
  table_create_customers: 'Creazione tabella clienti riuscita',
  table_create_both: 'Creazione tabelle prodotti e clienti riuscita',
};

// null se il job non e' un evento di creazione tabelle.
export function tableCreationMessage(jobType: string): string | null {
  return TABLE_CREATION_MESSAGES[jobType] ?? null;
}

export interface StatusBadge {
  tone: 'success' | 'critical' | 'info';
  label: string;
}

export function syncStatusBadge(status: string): StatusBadge {
  if (status === 'completed') return { tone: 'success', label: 'Completata' };
  if (status === 'failed') return { tone: 'critical', label: 'Fallita' };
  return { tone: 'info', label: 'In corso' };
}

// null finche' il job non e' concluso: non c'e' ancora una durata da mostrare.
export function formatDuration(
  startedAt: string,
  completedAt: string | null,
): string | null {
  if (!completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function due(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${due(d.getDate())}/${due(d.getMonth() + 1)}/${d.getFullYear()} ${due(d.getHours())}:${due(d.getMinutes())}`;
}

// Terza colonna: vuota per le creazioni tabella, altrimenti varianti idonee e —
// solo se il piano li include — i clienti.
export function syncRowNumbers(
  job: { jobType: string; variantsSynced: number; customersSynced: number },
  customersEnabled: boolean,
): string {
  if (tableCreationMessage(job.jobType) !== null) return '';
  const parts = [`${job.variantsSynced} varianti idonee`];
  if (customersEnabled) parts.push(`${job.customersSynced} clienti`);
  return parts.join(' · ');
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/components/Dashboard/sync-log-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/sync-log-format.ts app/components/Dashboard/sync-log-format.test.ts
git commit -m "feat: funzioni di formattazione del log di sincronizzazione"
```

---

### Task 2: Rilevamento delle tabelle create

**Files:**
- Create: `app/lib/supabase/detect-created-tables.ts`
- Test: `app/lib/supabase/detect-created-tables.test.ts`

**Interfaces:**
- Produces: `expectedTables(includeCustomers: boolean): string[]`, `detectCreatedTables(existing: string[], includeCustomers: boolean): string[]`, `tableCreationJobType(created: string[]): string | null`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/supabase/detect-created-tables.test.ts
import { describe, it, expect } from 'vitest';
import {
  expectedTables,
  detectCreatedTables,
  tableCreationJobType,
} from './detect-created-tables';

describe('expectedTables', () => {
  it('senza clienti solo products', () => expect(expectedTables(false)).toEqual(['products']));
  it('con clienti entrambe', () => expect(expectedTables(true)).toEqual(['products', 'customers']));
});

describe('detectCreatedTables', () => {
  it('database vuoto con clienti inclusi → create entrambe', () => {
    expect(detectCreatedTables([], true)).toEqual(['products', 'customers']);
  });
  it('products gia presente → creata solo customers', () => {
    expect(detectCreatedTables(['products'], true)).toEqual(['customers']);
  });
  it('entrambe gia presenti → nessuna creata', () => {
    expect(detectCreatedTables(['products', 'customers'], true)).toEqual([]);
  });
  it('confronto insensibile alle maiuscole', () => {
    expect(detectCreatedTables(['PRODUCTS'], true)).toEqual(['customers']);
  });
  it('piano senza clienti ignora customers', () => {
    expect(detectCreatedTables([], false)).toEqual(['products']);
  });
});

describe('tableCreationJobType', () => {
  it('entrambe', () => expect(tableCreationJobType(['products', 'customers'])).toBe('table_create_both'));
  it('solo prodotti', () => expect(tableCreationJobType(['products'])).toBe('table_create_products'));
  it('solo clienti', () => expect(tableCreationJobType(['customers'])).toBe('table_create_customers'));
  it('niente creato → nessun evento', () => expect(tableCreationJobType([])).toBeNull());
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/supabase/detect-created-tables.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/lib/supabase/detect-created-tables.ts

// I nomi sono letterali perche' e' esattamente cio' che la DDL crea
// (buildTableSQL li scrive hardcoded); i campi configurabili tableNameProducts /
// tableNameCustomers riguardano il percorso di lettura/scrittura della sync.
export function expectedTables(includeCustomers: boolean): string[] {
  return includeCustomers ? ['products', 'customers'] : ['products'];
}

// Le tabelle attese che NON erano gia' presenti: sono quelle create dalla DDL.
export function detectCreatedTables(
  existing: string[],
  includeCustomers: boolean,
): string[] {
  const present = new Set(existing.map((t) => t.toLowerCase()));
  return expectedTables(includeCustomers).filter((t) => !present.has(t));
}

// jobType che codifica cosa e' stato creato; null se non e' stato creato nulla
// (in quel caso non si registra alcun evento).
export function tableCreationJobType(created: string[]): string | null {
  const hasProducts = created.includes('products');
  const hasCustomers = created.includes('customers');
  if (hasProducts && hasCustomers) return 'table_create_both';
  if (hasProducts) return 'table_create_products';
  if (hasCustomers) return 'table_create_customers';
  return null;
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/supabase/detect-created-tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase/detect-created-tables.ts app/lib/supabase/detect-created-tables.test.ts
git commit -m "feat: rilevamento delle tabelle create sul progetto merchant"
```

---

### Task 3: runQueryRows — leggere il risultato di una SELECT

**Files:**
- Modify: `app/lib/supabase-management.server.ts` (aggiunta accanto a `runQuery`, riga ~156-170)
- Test: `app/lib/supabase-management-rows.test.ts`

**Interfaces:**
- Produces: `runQueryRows<T = Record<string, unknown>>(accessToken: string, ref: string, query: string): Promise<T[]>`

**Perché serve:** `runQuery` ha tipo di ritorno `Promise<void>` e **scarta il corpo della risposta** (è nata per la DDL). Per il controllo preventivo dello schema serve leggere le righe.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/supabase-management-rows.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runQueryRows } from './supabase-management.server';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('runQueryRows', () => {
  it('restituisce le righe della SELECT', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ table_name: 'products' }, { table_name: 'customers' }],
    }) as unknown as typeof fetch;

    const rows = await runQueryRows<{ table_name: string }>('tok', 'ref123', 'SELECT 1;');
    expect(rows.map((r) => r.table_name)).toEqual(['products', 'customers']);
  });

  it('risposta non-array → lista vuota', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'nope' }),
    }) as unknown as typeof fetch;

    expect(await runQueryRows('tok', 'ref123', 'SELECT 1;')).toEqual([]);
  });

  it('errore HTTP → eccezione', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(runQueryRows('tok', 'ref123', 'SELECT 1;')).rejects.toThrow('500');
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/supabase-management-rows.test.ts`
Expected: FAIL — `runQueryRows` non esportata.

- [ ] **Step 3: Implementa**

Aggiungi in `app/lib/supabase-management.server.ts`, subito dopo `runQuery`:

```ts
// Come runQuery, ma restituisce le righe. runQuery e' pensata per la DDL e
// scarta il corpo della risposta: per le SELECT serve leggerlo.
export async function runQueryRows<T = Record<string, unknown>>(
  accessToken: string,
  ref: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Supabase query error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/supabase-management-rows.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management-rows.test.ts
git commit -m "feat: runQueryRows per leggere il risultato delle SELECT"
```

---

### Task 4: Registrazione dell'evento di creazione tabelle

**Files:**
- Modify: `app/routes/api.supabase.select-project.tsx`

**Interfaces:**
- Consumes: `runQueryRows` (Task 3), `detectCreatedTables` + `tableCreationJobType` (Task 2).

- [ ] **Step 1: Aggiungi gli import**

In `app/routes/api.supabase.select-project.tsx`:

```ts
import { runQueryRows } from '~/lib/supabase-management.server';
import {
  detectCreatedTables,
  tableCreationJobType,
} from '~/lib/supabase/detect-created-tables';
```

(`runQueryRows` va aggiunta all'import già esistente da `~/lib/supabase-management.server` se presente, invece di crearne uno nuovo.)

- [ ] **Step 2: Rileva le tabelle preesistenti PRIMA della DDL**

Nel blocco `try`, **subito prima** della riga `await runQuery(token, ref, buildMerchantSchemaSQL(includeCustomers));`, inserisci:

```ts
    // Quali tabelle esistono gia': serve a distinguere nel log "create entrambe"
    // da "mancava solo clienti". La DDL usa CREATE TABLE IF NOT EXISTS e non
    // riporta cosa ha creato, quindi il confronto va fatto prima.
    // Best effort: se fallisce si perde solo il dettaglio del log.
    let existingTables: string[] = [];
    try {
      const rows = await runQueryRows<{ table_name: string }>(
        token,
        ref,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('products', 'customers');",
      );
      existingTables = rows.map((r) => r.table_name).filter(Boolean);
    } catch (err) {
      console.warn(
        '[api.supabase.select-project] controllo tabelle preesistenti fallito:',
        err instanceof Error ? err.message : 'errore sconosciuto',
      );
    }
```

- [ ] **Step 3: Registra l'evento DOPO la DDL**

**Subito dopo** la riga `await runQuery(token, ref, buildMerchantSchemaSQL(includeCustomers));`, inserisci:

```ts
    // Log dell'evento di creazione tabelle. Best effort come l'emissione del
    // token-proxy: a questo punto la DDL e' riuscita e un errore qui non deve
    // far fallire il collegamento.
    try {
      const created = detectCreatedTables(existingTables, includeCustomers);
      const jobType = tableCreationJobType(created);
      if (jobType) {
        await prisma.syncJob.create({
          data: {
            shopId: shop.id,
            jobType,
            status: 'completed',
            completedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.warn(
        '[api.supabase.select-project] log creazione tabelle fallito:',
        err instanceof Error ? err.message : 'errore sconosciuto',
      );
    }
```

- [ ] **Step 4: Verifica**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: suite verde (nessun test nuovo in questo task: la logica e' gia' coperta dai Task 2 e 3), tipi puliti, build verde.

- [ ] **Step 5: Commit**

```bash
git add app/routes/api.supabase.select-project.tsx
git commit -m "feat: registra nel log la creazione delle tabelle merchant"
```

---

### Task 5: Componente SyncLog

**Files:**
- Create: `app/components/Dashboard/SyncLog.tsx`
- Delete: `app/components/Dashboard/ActivityLog.tsx`

**Interfaces:**
- Consumes: le funzioni del Task 1.
- Produces: `SyncLog` con props `{ jobs: SerializeFrom<SyncJob>[]; customersEnabled: boolean }`

- [ ] **Step 1: Crea il componente**

```tsx
// app/components/Dashboard/SyncLog.tsx
import { Card, BlockStack, Text, Badge, DataTable } from '@shopify/polaris';
import type { SerializeFrom } from '@remix-run/node';
import type { SyncJob } from '@prisma/client';
import {
  tableCreationMessage,
  syncStatusBadge,
  formatDuration,
  formatDateTime,
  syncRowNumbers,
} from './sync-log-format';

type SerializedSyncJob = SerializeFrom<SyncJob>;

interface SyncLogProps {
  jobs: SerializedSyncJob[];
  customersEnabled: boolean;
}

export function SyncLog({ jobs, customersEnabled }: SyncLogProps) {
  const rows = jobs.map((job) => {
    const creation = tableCreationMessage(job.jobType);
    const status = syncStatusBadge(job.status);

    // Per la creazione tabelle il badge porta il messaggio completo; per le sync
    // porta lo stato, con l'eventuale errore sotto.
    const stateCell = creation ? (
      <Badge tone="success">{creation}</Badge>
    ) : (
      <BlockStack gap="100">
        <Badge tone={status.tone}>{status.label}</Badge>
        {job.status === 'failed' && job.errors ? (
          <Text as="span" variant="bodySm" tone="critical">
            {(job.errors as { message?: string }).message ?? 'Errore sconosciuto'}
          </Text>
        ) : null}
      </BlockStack>
    );

    const duration = formatDuration(job.startedAt, job.completedAt);
    const when = duration
      ? `${formatDateTime(job.startedAt)} · ${duration}`
      : formatDateTime(job.startedAt);

    return [stateCell, when, syncRowNumbers(job, customersEnabled)];
  });

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Log di sincronizzazione
        </Text>
        {jobs.length === 0 ? (
          <Text as="p" tone="subdued">
            Nessuna attività registrata
          </Text>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text']}
            headings={['Stato', 'Data/ora', 'Prodotti e clienti']}
            rows={rows}
          />
        )}
      </BlockStack>
    </Card>
  );
}
```

**NON eliminare ancora** `ActivityLog.tsx`: `_index.tsx` lo importa e il build si romperebbe. La rimozione avviene nel Task 6, dopo la sostituzione dell'import, cosi' ogni task resta verificabile per conto suo.

- [ ] **Step 2: Verifica completa**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti verdi. Il nuovo componente compila e convive con quello vecchio ancora in uso.

- [ ] **Step 3: Commit**

```bash
git add app/components/Dashboard/SyncLog.tsx
git commit -m "feat: componente SyncLog a tre colonne in italiano"
```

---

### Task 6: Layout — Stepper a sinistra, log a destra

**Files:**
- Modify: `app/routes/_index.tsx`

**Interfaces:**
- Consumes: `SyncLog` (Task 5).

- [ ] **Step 1: Sostituisci import e layout**

In `app/routes/_index.tsx`:

1. Sostituisci l'import `import { ActivityLog } from '~/components/Dashboard/ActivityLog';` con:

```tsx
import { SyncLog } from '~/components/Dashboard/SyncLog';
```

2. Sostituisci la riga `<Stepper steps={stepperItems} />` con:

```tsx
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Stepper steps={stepperItems} />
          <SyncLog jobs={recentJobs} customersEnabled={customersEnabled} />
        </InlineGrid>
```

3. Rimuovi la `<Layout>` / `<Layout.Section>` che ospitava `<ActivityLog jobs={recentJobs} />` più in basso (il log ora sta nella riga sopra). Se dopo la rimozione la `<Layout>` resta vuota, elimina anche quella.

- [ ] **Step 2: Elimina il componente vecchio**

Ora che nessuno lo importa piu':

```bash
git rm app/components/Dashboard/ActivityLog.tsx
```

- [ ] **Step 3: Ripulisci gli import orfani**

**`tsc` NON segnala gli import inutilizzati in questo progetto** (`noUnusedLocals` non e' attivo): verifica a mano.

```bash
for s in Layout InlineGrid; do echo "--- $s"; grep -n "<$s" app/routes/_index.tsx; done
```

Rimuovi dall'import di `@shopify/polaris` i simboli che non compaiono piu' in alcun uso JSX.

- [ ] **Step 4: Verifica completa**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: Stepper a meta larghezza con il log di sincronizzazione a destra"
```

---

## Note di verifica manuale (post-deploy)

- Stepper a sinistra e log a destra sulla stessa riga su desktop; impilati su mobile.
- Ricollegando Supabase su un progetto vuoto compare la riga "Creazione tabelle prodotti e clienti riuscita" (o quella corretta fra le tre).
- Le righe di sync mostrano data, ora e durata, e i numeri solo nella terza colonna.

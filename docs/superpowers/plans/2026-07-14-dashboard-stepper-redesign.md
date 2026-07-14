# Dashboard Stepper Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riorganizzare la dashboard dell'app Shopify attorno a uno stepper verticale guidato, con StatsCard sull'idoneità dei prodotti calcolate live da Shopify, e sostituire la pagina bianca "Application Error" con il frame dell'app + banner rosso.

**Architecture:** Logica pura e testabile isolata in `app/lib/stats/` e `app/components/Dashboard/stepper-state.ts`; una resource route `GET /api/stats/products` scansiona Shopify in background e alimenta le card via `useFetcher`; il gate dello Step 2 è un nuovo campo `connectionVerifiedAt` su `SupabaseConfig`; un `ErrorBoundary` in `app/root.tsx` mantiene il guscio Polaris.

**Tech Stack:** Remix, TypeScript, Shopify Polaris, `@shopify/shopify-app-remix`, Prisma, Vitest.

## Global Constraints

- App embedded Shopify (Remix + Polaris); nessuna nuova infrastruttura a pagamento (Vercel Free).
- I `Button` non devono **mai** essere full-width: si dimensionano al contenuto (niente `fullWidth`, niente `size="large"` che allarga).
- La classificazione "pronto"/"con problemi" usa il campo `variant.cost` (`ShopifyVariant.cost: string | null`) — lo stesso campo che il transformer scrive in `cost_per_item`. Idoneo = `cost` non null e non stringa vuota.
- La card **Clienti** e il titolo "Sincronizza prodotti e clienti" compaiono solo se `plan.customersSyncEnabled === true` (Pro+); altrimenti "Sincronizza prodotti".
- Lo **Step 2 si sblocca** se e solo se `supabaseConfig.connectionVerifiedAt != null`.
- Testi UI in italiano.
- Test runner: `npm test` (vitest). Nessun `@testing-library/react` installato → i test coprono **solo funzioni pure**; componenti/route si verificano con `npm run typecheck` + verifica manuale.

---

### Task 1: Campo `connectionVerifiedAt` su SupabaseConfig

**Files:**
- Modify: `prisma/schema.prisma` (model `SupabaseConfig`)
- Create: migrazione Prisma in `prisma/migrations/`

**Interfaces:**
- Produces: `SupabaseConfig.connectionVerifiedAt: DateTime | null` (colonna DB `connection_verified_at`), usato da Task 4, 7, 8.

- [ ] **Step 1: Aggiungere il campo allo schema**

In `prisma/schema.prisma`, dentro `model SupabaseConfig`, subito dopo la riga `syncIntervalHours ... @map("sync_interval_hours")`, aggiungere:

```prisma
  connectionVerifiedAt   DateTime? @map("connection_verified_at")
```

- [ ] **Step 2: Validare lo schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Creare la migrazione e generare il client**

Run: `npx prisma migrate dev --name add_connection_verified_at`
Expected: crea `prisma/migrations/<timestamp>_add_connection_verified_at/migration.sql` e rigenera il client.

Se il DB di sviluppo non è raggiungibile, creare comunque la migrazione senza applicarla e rigenerare il client:
Run: `npx prisma migrate dev --name add_connection_verified_at --create-only && npx prisma generate`

Il contenuto della migrazione deve essere:

```sql
ALTER TABLE "supabase_configs" ADD COLUMN "connection_verified_at" TIMESTAMP;
```

> Nota produzione: eseguire lo stesso `ALTER TABLE` nel SQL Editor del Supabase metadata.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore (il client Prisma ora espone `connectionVerifiedAt`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add connectionVerifiedAt to SupabaseConfig"
```

---

### Task 2: Funzione pura di idoneità prodotti

**Files:**
- Create: `app/lib/stats/product-readiness.ts`
- Test: `app/lib/stats/product-readiness.test.ts`

**Interfaces:**
- Consumes: `ShopifyProduct` da `~/types/shopify`.
- Produces:
  - `isVariantReady(cost: string | null | undefined): boolean`
  - `interface ProductReadinessCounts { totalProducts: number; readyCount: number; problemCount: number }`
  - `computeProductReadiness(products: ShopifyProduct[]): ProductReadinessCounts`
  - Usati da Task 4.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect } from 'vitest';
import { isVariantReady, computeProductReadiness } from './product-readiness';
import type { ShopifyProduct } from '~/types/shopify';

function makeProduct(costs: (string | null)[]): ShopifyProduct {
  return {
    id: 1, title: 't', body_html: '', vendor: '', product_type: '', handle: 'h',
    status: 'active', tags: '', published_at: null,
    variants: costs.map((cost, i) => ({
      id: i + 1, product_id: 1, title: `v${i}`, sku: '', barcode: null,
      price: '10.00', compare_at_price: null, cost, position: i + 1,
      inventory_quantity: 0, weight: 0, weight_unit: 'kg',
      requires_shipping: true, taxable: true, image_id: null,
      option1: null, option2: null, option3: null,
    })),
  };
}

describe('isVariantReady', () => {
  it('is true when cost is a non-empty string (including "0.00")', () => {
    expect(isVariantReady('12.50')).toBe(true);
    expect(isVariantReady('0.00')).toBe(true);
  });
  it('is false when cost is null, undefined or blank', () => {
    expect(isVariantReady(null)).toBe(false);
    expect(isVariantReady(undefined)).toBe(false);
    expect(isVariantReady('   ')).toBe(false);
  });
});

describe('computeProductReadiness', () => {
  it('counts products and classifies each variant by cost', () => {
    const products = [makeProduct(['5.00', null]), makeProduct(['3.00'])];
    expect(computeProductReadiness(products)).toEqual({
      totalProducts: 2,
      readyCount: 2,
      problemCount: 1,
    });
  });
  it('returns zeros for an empty catalog', () => {
    expect(computeProductReadiness([])).toEqual({
      totalProducts: 0, readyCount: 0, problemCount: 0,
    });
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npm test -- product-readiness --run`
Expected: FAIL — "Cannot find module './product-readiness'".

- [ ] **Step 3: Implementare la funzione**

```typescript
// app/lib/stats/product-readiness.ts
import type { ShopifyProduct } from '~/types/shopify';

export interface ProductReadinessCounts {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
}

export function isVariantReady(cost: string | null | undefined): boolean {
  return cost !== null && cost !== undefined && String(cost).trim() !== '';
}

export function computeProductReadiness(
  products: ShopifyProduct[],
): ProductReadinessCounts {
  let readyCount = 0;
  let problemCount = 0;
  for (const product of products) {
    for (const variant of product.variants) {
      if (isVariantReady(variant.cost)) readyCount++;
      else problemCount++;
    }
  }
  return { totalProducts: products.length, readyCount, problemCount };
}
```

- [ ] **Step 4: Eseguire il test per verificarne il successo**

Run: `npm test -- product-readiness --run`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/stats/product-readiness.ts app/lib/stats/product-readiness.test.ts
git commit -m "feat: add product readiness classification helper"
```

---

### Task 3: `ShopifyAPIClient.getCustomersCount()`

**Files:**
- Modify: `app/lib/shopify-api.server.ts` (aggiungere metodo alla classe `ShopifyAPIClient`)
- Test: `app/lib/shopify-api.test.ts` (aggiungere un caso)

**Interfaces:**
- Produces: `ShopifyAPIClient.getCustomersCount(): Promise<number>` (endpoint `customers/count.json`), usato da Task 4.

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in fondo al `describe('Shopify API Client', ...)` di `app/lib/shopify-api.test.ts`:

```typescript
  it('should return the customers count from customers/count.json', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 42 }),
      headers: new Map(),
    });

    const client = new ShopifyAPIClient('test.myshopify.com', 'token');
    const count = await client.getCustomersCount();

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toContain('customers/count.json');
    expect(count).toBe(42);
  });
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npm test -- shopify-api --run`
Expected: FAIL — `client.getCustomersCount is not a function`.

- [ ] **Step 3: Implementare il metodo**

In `app/lib/shopify-api.server.ts`, subito prima della chiusura della classe (dopo `getCustomers`), aggiungere:

```typescript
  async getCustomersCount(): Promise<number> {
    const { data } = await this.makeRequest('customers/count.json');
    return typeof data.count === 'number' ? data.count : 0;
  }
```

- [ ] **Step 4: Eseguire il test per verificarne il successo**

Run: `npm test -- shopify-api --run`
Expected: PASS (incluso il nuovo test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/shopify-api.server.ts app/lib/shopify-api.test.ts
git commit -m "feat: add getCustomersCount to Shopify API client"
```

---

### Task 4: Resource route `GET /api/stats/products`

**Files:**
- Create: `app/routes/api.stats.products.tsx`

**Interfaces:**
- Consumes: `computeProductReadiness` (Task 2), `ShopifyAPIClient` + `getCustomersCount` (Task 3), `authenticate` da `~/shopify.server`, `prisma` da `~/db.server`.
- Produces: risposta JSON `StatsResponse`:
  ```typescript
  interface StatsResponse {
    totalProducts: number;
    readyCount: number;
    problemCount: number;
    customersEnabled: boolean;
    customerCount: number | null; // null se piano non Pro+
  }
  ```
  Usato dal loader/fetcher di Task 7.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.stats.products.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { computeProductReadiness } from '~/lib/stats/product-readiness';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  const customersEnabled = plan?.customersSyncEnabled ?? false;

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  let totalProducts = 0;
  let readyCount = 0;
  let problemCount = 0;
  let pageInfo: string | undefined;

  do {
    const { products, nextPageInfo } = await client.getProducts({
      limit: 250,
      pageInfo,
    });
    const counts = computeProductReadiness(products ?? []);
    totalProducts += counts.totalProducts;
    readyCount += counts.readyCount;
    problemCount += counts.problemCount;
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  const customerCount = customersEnabled
    ? await client.getCustomersCount()
    : null;

  return json({
    totalProducts,
    readyCount,
    problemCount,
    customersEnabled,
    customerCount,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale (dev)**

Con `npm run dev` attivo e l'app installata su uno store di test, aprire nel browser (dentro l'app embedded) la Network tab e confermare che `GET /api/stats/products` risponde `200` con il JSON dei conteggi. In alternativa questa verifica avviene end-to-end nel Task 7.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api.stats.products.tsx
git commit -m "feat: add /api/stats/products resource route"
```

---

### Task 5: Logica di stato dello stepper (pura) + componente Stepper

**Files:**
- Create: `app/components/Dashboard/stepper-state.ts`
- Test: `app/components/Dashboard/stepper-state.test.ts`
- Create: `app/components/Dashboard/Stepper.tsx`

**Interfaces:**
- Produces:
  - `type StepState = 'complete' | 'active' | 'locked'`
  - `interface DashboardStepStates { connectSupabase: StepState; sync: StepState }`
  - `resolveStepStates(supabaseConnected: boolean): DashboardStepStates`
  - `interface StepperItem { id: string; title: string; state: StepState; content?: ReactNode; lockedHint?: string }`
  - `Stepper({ steps }: { steps: StepperItem[] })`
  - Usati da Task 7.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
// app/components/Dashboard/stepper-state.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStepStates } from './stepper-state';

describe('resolveStepStates', () => {
  it('locks sync and activates connect when not connected', () => {
    expect(resolveStepStates(false)).toEqual({
      connectSupabase: 'active',
      sync: 'locked',
    });
  });
  it('completes connect and activates sync when connected', () => {
    expect(resolveStepStates(true)).toEqual({
      connectSupabase: 'complete',
      sync: 'active',
    });
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `npm test -- stepper-state --run`
Expected: FAIL — "Cannot find module './stepper-state'".

- [ ] **Step 3: Implementare la logica di stato**

```typescript
// app/components/Dashboard/stepper-state.ts
export type StepState = 'complete' | 'active' | 'locked';

export interface DashboardStepStates {
  connectSupabase: StepState;
  sync: StepState;
}

export function resolveStepStates(
  supabaseConnected: boolean,
): DashboardStepStates {
  return supabaseConnected
    ? { connectSupabase: 'complete', sync: 'active' }
    : { connectSupabase: 'active', sync: 'locked' };
}
```

- [ ] **Step 4: Eseguire il test per verificarne il successo**

Run: `npm test -- stepper-state --run`
Expected: PASS (2 test).

- [ ] **Step 5: Implementare il componente Stepper**

```tsx
// app/components/Dashboard/Stepper.tsx
import type { ReactNode } from 'react';
import { Card, BlockStack, InlineStack, Text, Badge } from '@shopify/polaris';
import type { StepState } from './stepper-state';

export interface StepperItem {
  id: string;
  title: string;
  state: StepState;
  content?: ReactNode;
  lockedHint?: string;
}

const BADGE: Record<StepState, { tone?: 'success' | 'info'; label: string }> = {
  complete: { tone: 'success', label: 'Completato' },
  active: { tone: 'info', label: 'In corso' },
  locked: { tone: undefined, label: 'Bloccato' },
};

export function Stepper({ steps }: { steps: StepperItem[] }) {
  return (
    <BlockStack gap="300">
      {steps.map((step, index) => (
        <Card key={step.id}>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text
                as="span"
                variant="headingSm"
                tone={step.state === 'locked' ? 'subdued' : undefined}
              >
                {index + 1}. {step.title}
              </Text>
              <Badge tone={BADGE[step.state].tone}>
                {BADGE[step.state].label}
              </Badge>
            </InlineStack>

            {step.state === 'active' && step.content}

            {step.state === 'locked' && step.lockedHint && (
              <Text as="p" tone="subdued">
                {step.lockedHint}
              </Text>
            )}
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add app/components/Dashboard/stepper-state.ts app/components/Dashboard/stepper-state.test.ts app/components/Dashboard/Stepper.tsx
git commit -m "feat: add vertical stepper component and state logic"
```

---

### Task 6: Stato loading sulle StatsCard

**Files:**
- Modify: `app/components/Dashboard/StatsCard.tsx`

**Interfaces:**
- Produces: `StatsCard` accetta prop opzionale `loading?: boolean`; quando `true` mostra uno skeleton al posto del valore. Usato da Task 7.

- [ ] **Step 1: Aggiornare il componente**

Sostituire l'intero contenuto di `app/components/Dashboard/StatsCard.tsx` con:

```tsx
import { Card, Text, BlockStack, SkeletonBodyText } from '@shopify/polaris';

type StatsStatus = 'success' | 'warning' | 'critical';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  status?: StatsStatus;
  loading?: boolean;
}

// Polaris <Text> uses "caution" rather than "warning" for its tone scale.
const TONE_BY_STATUS: Record<StatsStatus, 'success' | 'caution' | 'critical'> = {
  success: 'success',
  warning: 'caution',
  critical: 'critical',
};

export function StatsCard({ title, value, icon, status, loading }: StatsCardProps) {
  return (
    <Card>
      <BlockStack gap="200">
        {icon}
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {loading ? (
          <SkeletonBodyText lines={1} />
        ) : (
          <Text
            as="p"
            variant="heading2xl"
            tone={status ? TONE_BY_STATUS[status] : undefined}
          >
            {String(value)}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/components/Dashboard/StatsCard.tsx
git commit -m "feat: add loading skeleton state to StatsCard"
```

---

### Task 7: Riscrittura della dashboard `_index.tsx`

**Files:**
- Modify: `app/routes/_index.tsx` (loader, action, componente)

**Interfaces:**
- Consumes: `StatsResponse` (Task 4), `resolveStepStates` + `Stepper` + `StepperItem` (Task 5), `StatsCard` con `loading` (Task 6), `ActivityLog`, `PlanBanner`.

- [ ] **Step 1: Sostituire il loader**

Sostituire la funzione `loader` (righe ~21-85) con:

```tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { supabaseConfig: true },
  });

  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });

  const recentJobs = await prisma.syncJob.findMany({
    where: { shopId: shop.id },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });

  const supabaseConnected = !!shop.supabaseConfig?.connectionVerifiedAt;
  const customersEnabled = plan?.customersSyncEnabled ?? false;

  return json({
    shop,
    plan,
    recentJobs,
    supabaseConnected,
    customersEnabled,
  });
}
```

Rimuovere gli import ora inutilizzati `createSupabaseClient` (da `~/lib/supabase.server`); mantenere `syncQueue` (usato dall'action).

- [ ] **Step 2: Aggiornare gli import in testa al file**

Assicurarsi che gli import includano `useFetcher` e `useEffect`, e i componenti Polaris usati:

```tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, Form, useFetcher } from '@remix-run/react';
import { useEffect } from 'react';
import {
  Page,
  Layout,
  BlockStack,
  InlineGrid,
  InlineStack,
  Button,
  Text,
} from '@shopify/polaris';
import { StatsCard } from '~/components/Dashboard/StatsCard';
import { ActivityLog } from '~/components/Dashboard/ActivityLog';
import { PlanBanner } from '~/components/Dashboard/PlanBanner';
import { Stepper, type StepperItem } from '~/components/Dashboard/Stepper';
import { resolveStepStates } from '~/components/Dashboard/stepper-state';
import { prisma } from '~/db.server';
import { syncQueue } from '~/lib/queue/queues.server';
import { authenticate } from '~/shopify.server';
```

- [ ] **Step 3: Mantenere l'action invariata**

L'`action` esistente (accoda `manual-sync`) resta identica. Nessuna modifica.

- [ ] **Step 4: Sostituire il componente Dashboard**

Sostituire l'intera funzione `export default function Dashboard()` con:

```tsx
interface StatsResponse {
  totalProducts: number;
  readyCount: number;
  problemCount: number;
  customersEnabled: boolean;
  customerCount: number | null;
}

export default function Dashboard() {
  const { shop, plan, recentJobs, supabaseConnected, customersEnabled } =
    useLoaderData<typeof loader>();

  const statsFetcher = useFetcher<StatsResponse>();

  useEffect(() => {
    statsFetcher.load('/api/stats/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = statsFetcher.data;
  const statsLoading = statsFetcher.state === 'loading' || !stats;

  const steps = resolveStepStates(supabaseConnected);
  const syncTitle = customersEnabled
    ? 'Sincronizza prodotti e clienti'
    : 'Sincronizza prodotti';

  const previewProducts = stats?.totalProducts ?? '…';
  const previewCustomers = stats?.customerCount ?? '…';

  const stepperItems: StepperItem[] = [
    {
      id: 'connect-supabase',
      title: 'Collega Supabase',
      state: steps.connectSupabase,
      content: (
        <BlockStack gap="200">
          <Text as="p" tone="subdued">
            Collega il tuo progetto Supabase per ricevere i dati sincronizzati.
            Le tabelle necessarie verranno create automaticamente in base al tuo
            piano.
          </Text>
          <InlineStack>
            <Button url="/settings/supabase" variant="primary">
              Collega Supabase
            </Button>
          </InlineStack>
        </BlockStack>
      ),
    },
    {
      id: 'sync',
      title: syncTitle,
      state: steps.sync,
      lockedHint:
        'Completa il collegamento a Supabase per sbloccare la sincronizzazione.',
      content: (
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Sincronizzerai {previewProducts} prodotti da Shopify → tabella{' '}
            <code>products</code> su Supabase
            {customersEnabled
              ? ` e ${previewCustomers} clienti → tabella customers`
              : ''}
            .
          </Text>
          <Form method="post">
            <InlineStack>
              <Button submit variant="primary">
                Avvia sincronizzazione
              </Button>
            </InlineStack>
          </Form>
        </BlockStack>
      ),
    },
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {plan && (
          <PlanBanner
            shop={shop}
            plan={plan}
            currentUsage={{
              products: stats?.totalProducts ?? 0,
              customers: stats?.customerCount ?? 0,
              customFields: 0,
            }}
          />
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: customersEnabled ? 4 : 3 }} gap="400">
          <StatsCard
            title="Prodotti totali"
            value={stats?.totalProducts ?? 0}
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti pronti"
            value={stats?.readyCount ?? 0}
            status="success"
            loading={statsLoading}
          />
          <StatsCard
            title="Prodotti con problemi"
            value={stats?.problemCount ?? 0}
            status="critical"
            loading={statsLoading}
          />
          {customersEnabled && (
            <StatsCard
              title="Clienti"
              value={stats?.customerCount ?? 0}
              loading={statsLoading}
            />
          )}
        </InlineGrid>

        <Stepper steps={stepperItems} />

        {supabaseConnected && (
          <Layout>
            <Layout.Section>
              <ActivityLog jobs={recentJobs} />
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
```

> Nota: `PlanBanner` riceve ora i conteggi live (o 0 durante il caricamento). Se la firma di `PlanBanner` non accetta `customers`/`customFields` come numeri opzionali, mantenere i valori a `0` come già fa oggi — non modificare `PlanBanner` in questo task.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore. Se compaiono import inutilizzati (`Card`), rimuoverli.

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test -- --run`
Expected: PASS (nessuna regressione).

- [ ] **Step 7: Verifica manuale**

Con `npm run dev`: la dashboard si apre subito con le StatsCard in skeleton, poi si popolano; lo Step 1 è attivo ed esteso con il pulsante "Collega Supabase" (non full-width); lo Step 2 è "Bloccato". L'ActivityLog non è visibile finché non si è connessi.

- [ ] **Step 8: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: rebuild dashboard with vertical stepper and live stats"
```

---

### Task 8: Valorizzare `connectionVerifiedAt` su test/create

**Files:**
- Modify: `app/routes/api.supabase.test-connection.tsx`
- Modify: `app/routes/api.supabase.create-tables.tsx`

**Interfaces:**
- Consumes: `prisma` da `~/db.server`, `SupabaseConfig.connectionVerifiedAt` (Task 1).
- Produces: side-effect DB — `connectionVerifiedAt` impostato a `now()` su successo, `null` su fallimento. Sblocca lo Step 2 (Task 7).

- [ ] **Step 1: Aggiornare `test-connection`**

In `app/routes/api.supabase.test-connection.tsx`:

Aggiungere l'import di prisma in testa:

```tsx
import { prisma } from '~/db.server';
```

Cambiare la firma per catturare la sessione (riga 9) da:

```tsx
  await authenticate.admin(request);
```
a:
```tsx
  const { session } = await authenticate.admin(request);
```

Nel blocco `try`, subito prima di `return json({ ok: true, message: 'Connection successful' });`, aggiungere l'aggiornamento del flag (best-effort, solo se esiste già una config salvata per lo shop):

```tsx
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
      include: { supabaseConfig: true },
    });
    if (shop?.supabaseConfig) {
      await prisma.supabaseConfig.update({
        where: { shopId: shop.id },
        data: { connectionVerifiedAt: new Date() },
      });
    }
```

Nel blocco `catch`, prima del `return json({ ok: false, message }, ...)`, azzerare il flag se la config esiste:

```tsx
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
      include: { supabaseConfig: true },
    });
    if (shop?.supabaseConfig) {
      await prisma.supabaseConfig.update({
        where: { shopId: shop.id },
        data: { connectionVerifiedAt: null },
      });
    }
```

- [ ] **Step 2: Aggiornare `create-tables`**

In `app/routes/api.supabase.create-tables.tsx`, il `shop` è già caricato. Nel blocco `try`, subito prima di `return json({ ok: true, message: 'Tables created successfully' });`, aggiungere:

```tsx
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: new Date() },
    });
```

Nel blocco `catch`, prima del `return json({ error: message }, ...)`, aggiungere:

```tsx
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: null },
    }).catch(() => {});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale**

Con `npm run dev`: salvando una config valida e cliccando "Create Tables in Supabase" con successo, tornando alla dashboard lo Step 1 risulta "Completato" e lo Step 2 "In corso". Con credenziali errate, lo Step 2 resta "Bloccato".

- [ ] **Step 5: Commit**

```bash
git add app/routes/api.supabase.test-connection.tsx app/routes/api.supabase.create-tables.tsx
git commit -m "feat: set connectionVerifiedAt on Supabase test/create success"
```

---

### Task 9: Pulsanti a destra in colonna in Impostazioni

**Files:**
- Modify: `app/routes/settings.supabase.tsx`

**Interfaces:** nessuna nuova. Solo layout.

- [ ] **Step 1: Importare `InlineStack`**

Nell'import da `@shopify/polaris`, aggiungere `InlineStack` alla lista dei componenti.

- [ ] **Step 2: Allineare a destra i pulsanti del form config**

Sostituire il blocco pulsanti dentro il form (attualmente):

```tsx
                  <BlockStack gap="300">
                    <Button variant="primary" submit>
                      Save Configuration
                    </Button>
                    <Button
                      onClick={testConnection}
                      loading={testFetcher.state !== 'idle'}
                      disabled={!url || !serviceKey}
                    >
                      Test Connection
                    </Button>
                    {testResult && (
                      <Banner tone={testResult.ok ? 'success' : 'critical'}>
                        {testResult.message}
                      </Banner>
                    )}
                  </BlockStack>
```

con:

```tsx
                  <BlockStack gap="300">
                    <InlineStack align="end">
                      <BlockStack gap="200" inlineAlign="end">
                        <Button variant="primary" submit>
                          Save Configuration
                        </Button>
                        <Button
                          onClick={testConnection}
                          loading={testFetcher.state !== 'idle'}
                          disabled={!url || !serviceKey}
                        >
                          Test Connection
                        </Button>
                      </BlockStack>
                    </InlineStack>
                    {testResult && (
                      <Banner tone={testResult.ok ? 'success' : 'critical'}>
                        {testResult.message}
                      </Banner>
                    )}
                  </BlockStack>
```

- [ ] **Step 3: Allineare a destra il pulsante "Create Tables"**

Sostituire il pulsante nel Card "Create Tables" (attualmente):

```tsx
                <Button
                  onClick={createTables}
                  loading={createTablesFetcher.state !== 'idle'}
                >
                  Create Tables in Supabase
                </Button>
```

con:

```tsx
                <InlineStack align="end">
                  <Button
                    onClick={createTables}
                    loading={createTablesFetcher.state !== 'idle'}
                  >
                    Create Tables in Supabase
                  </Button>
                </InlineStack>
```

- [ ] **Step 4: Allineare a destra il pulsante "Crea account Supabase"**

Sostituire (nel primo Card):

```tsx
                <Button
                  url="https://supabase.com/sign-up"
                  target="_blank"
                >
                  Crea account Supabase
                </Button>
```

con:

```tsx
                <InlineStack align="end">
                  <Button url="https://supabase.com/sign-up" target="_blank">
                    Crea account Supabase
                  </Button>
                </InlineStack>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 6: Verifica manuale**

In `/settings/supabase` i pulsanti sono allineati a destra, impilati in colonna, ciascuno largo quanto il proprio testo (non full-width).

- [ ] **Step 7: Commit**

```bash
git add app/routes/settings.supabase.tsx
git commit -m "feat: right-align settings buttons in a content-width column"
```

---

### Task 10: ErrorBoundary con frame app + banner rosso

**Files:**
- Modify: `app/root.tsx`

**Interfaces:** nessuna nuova. Esporta `ErrorBoundary` da root.

- [ ] **Step 1: Aggiungere gli import necessari**

In `app/root.tsx`, estendere gli import da `@remix-run/react` per includere `useRouteError` e `isRouteErrorResponse`:

```tsx
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from '@remix-run/react';
```

Aggiungere gli import Polaris di base e le traduzioni (in testa al file, dopo gli import esistenti):

```tsx
import {
  AppProvider as PolarisAppProvider,
  Page,
  Banner,
  Text,
  BlockStack,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
```

- [ ] **Step 2: Aggiungere l'export `ErrorBoundary`**

In fondo a `app/root.tsx`, aggiungere:

```tsx
export function ErrorBoundary() {
  const error = useRouteError();

  let title = 'Si è verificato un errore';
  let detail = 'Errore sconosciuto';

  if (isRouteErrorResponse(error)) {
    title = `Errore ${error.status} ${error.statusText}`;
    detail =
      typeof error.data === 'string'
        ? error.data
        : JSON.stringify(error.data);
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <PolarisAppProvider i18n={enTranslations}>
          <Page title="Supabase Tracking Sync">
            <BlockStack gap="400">
              <Banner tone="critical" title={title}>
                <Text as="p">{detail}</Text>
              </Banner>
            </BlockStack>
          </Page>
        </PolarisAppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore. Se `enTranslations` dà errore di import JSON, verificare che `tsconfig.json` abbia `"resolveJsonModule": true` (già atteso nei progetti Remix); in caso contrario aggiungerlo sotto `compilerOptions`.

- [ ] **Step 4: Verifica manuale**

Forzare un errore temporaneo nel loader di `_index.tsx` (es. `throw new Error('Test boundary');` all'inizio del loader), aprire l'app: invece della pagina bianca "Application Error" deve comparire il titolo "Supabase Tracking Sync" con un **Banner rosso** contenente "Test boundary". Rimuovere poi il `throw` di prova.

- [ ] **Step 5: Commit**

```bash
git add app/root.tsx
git commit -m "feat: render app shell with red banner instead of blank error page"
```

---

## Self-Review

**Spec coverage:**
- §2 layout stepper minimalista → Task 5 (Stepper) + Task 7 (dashboard).
- §3 StatsCard live (totali/pronti/problemi/clienti Pro+) → Task 2 (readiness), Task 3 (customers count), Task 4 (route), Task 6 (loading), Task 7 (render + fetcher).
- §4 stepper stati + gate `connectionVerifiedAt` → Task 1 (schema), Task 5 (stati), Task 7 (titolo dinamico, preview, lockedHint), Task 8 (set/reset flag).
- §5 pulsanti non full-width + Impostazioni a destra → Task 7 (InlineStack wrap), Task 9 (settings).
- §6 ErrorBoundary frame + banner rosso → Task 10.
- §7 file coinvolti → tutti coperti.
- §8 test → Task 2/3/5 (unit puri), verifica manuale nelle altre task (assenza di RTL dichiarata nei Global Constraints).

**Placeholder scan:** nessun "TBD/TODO"; ogni step di codice mostra il codice completo. Il carattere `…` nella UI è un valore di placeholder *runtime* voluto (stato di caricamento), non un buco del piano.

**Type consistency:** `StatsResponse` (Task 4) combacia con l'interfaccia usata nel fetcher (Task 7); `StepState`/`resolveStepStates`/`StepperItem` (Task 5) usati coerentemente in Task 7; `connectionVerifiedAt` (Task 1) usato in Task 7 e 8; `isVariantReady`/`computeProductReadiness` (Task 2) usati in Task 4; `getCustomersCount` (Task 3) usato in Task 4.

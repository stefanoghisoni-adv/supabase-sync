# Riordino card superiori dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire le quattro `StatsCard` in cima alla dashboard con tre macro card sulla stessa riga (Account, Prodotti, Clienti), ognuna fatta di righe etichetta + badge.

**Architecture:** La logica decisionale sta in funzioni pure testate; i componenti sono markup Polaris dichiarativo che le consuma. I conteggi di consenso clienti arrivano da un nuovo endpoint che pagina l'Admin API con lo stesso schema cache-then-refresh già usato per la readiness prodotti.

**Tech Stack:** Remix 2, React, Shopify Polaris 13, TypeScript, Vitest, Prisma, ioredis.

## Global Constraints

- **Tutto in Shopify Polaris.** Niente `div` con stile inline né CSS custom dove esiste un componente Polaris (`Card`, `Box`, `InlineStack`, `BlockStack`, `Badge`, `Button`, `Text`, `Icon`, `Tooltip`, `InlineGrid`). Unica eccezione ammessa e documentata: il **gradiente** dell'overlay della card Clienti e gli attributi `aria-hidden`/`pointer-events`, che Polaris non esprime.
- Etichette righe prodotti **verbatim**: `Prodotti totali`, `Prodotti idonei`, `Non idonei`.
- Etichette righe clienti **verbatim**: `Clienti totali`, `Clienti opt-in`, `Clienti opt-out`.
- Testi info **verbatim**: opt-in → `Qui vengono identificati i clienti che hanno acconsentito al marketing`; opt-out → `Qui vengono identificati i clienti che non hanno acconsentito al marketing`.
- Etichette piani: `free → Free`, `pro → Pro+`, `business → Business`, `enterprise → Enterprise`, `lifetime → Lifetime`.
- I tre numeri prodotti contano **varianti**; vale sempre `idonei + non idonei = totale`.
- Il pulsante `Aggiorna piano` resta **`disabled` con Tooltip "Presto disponibile"** (Billing non ancora implementato).
- **Non esiste infrastruttura per test di componenti React** (niente jsdom/testing-library, ambiente Vitest `node`): non aggiungerla. I componenti si verificano con `tsc` e `build`; la logica sta nelle funzioni pure testate.
- TDD sulle funzioni pure e sulle route. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Formattazione piano e frequenza sync

**Files:**
- Create: `app/components/Dashboard/account-format.ts`
- Test: `app/components/Dashboard/account-format.test.ts`

**Interfaces:**
- Produces: `planLabel(planName: string | null | undefined): string`, `syncFrequencyLabel(hours: number | null | undefined): string`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/components/Dashboard/account-format.test.ts
import { describe, it, expect } from 'vitest';
import { planLabel, syncFrequencyLabel } from './account-format';

describe('planLabel', () => {
  it('mappa i piani noti', () => {
    expect(planLabel('free')).toBe('Free');
    expect(planLabel('pro')).toBe('Pro+');
    expect(planLabel('business')).toBe('Business');
    expect(planLabel('enterprise')).toBe('Enterprise');
    expect(planLabel('lifetime')).toBe('Lifetime');
  });
  it('tollera maiuscole e spazi', () => {
    expect(planLabel('  PRO ')).toBe('Pro+');
  });
  it('piano sconosciuto → capitalizzato', () => {
    expect(planLabel('custom')).toBe('Custom');
  });
  it('valore assente → trattino', () => {
    expect(planLabel(null)).toBe('—');
    expect(planLabel('')).toBe('—');
  });
});

describe('syncFrequencyLabel', () => {
  it('1 ora', () => expect(syncFrequencyLabel(1)).toBe('Ogni ora'));
  it('24 ore', () => expect(syncFrequencyLabel(24)).toBe('Ogni 24 ore'));
  it('mezz ora → minuti', () => expect(syncFrequencyLabel(0.5)).toBe('Ogni 30 minuti'));
  it('decimale → una cifra', () => expect(syncFrequencyLabel(1.5)).toBe('Ogni 1.5 ore'));
  it('assente o non valido → trattino', () => {
    expect(syncFrequencyLabel(null)).toBe('—');
    expect(syncFrequencyLabel(0)).toBe('—');
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/components/Dashboard/account-format.test.ts`
Expected: FAIL — modulo `./account-format` non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/components/Dashboard/account-format.ts

// Il nome tecnico del piano (colonna plan_name) non e' adatto alla UI: mappa esplicita.
const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro+',
  business: 'Business',
  enterprise: 'Enterprise',
  lifetime: 'Lifetime',
};

export function planLabel(planName: string | null | undefined): string {
  const key = (planName ?? '').trim().toLowerCase();
  if (!key) return '—';
  if (PLAN_LABELS[key]) return PLAN_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Plan.maxSyncFrequencyHours e' un Float: sotto l'ora si legge meglio in minuti.
export function syncFrequencyLabel(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 1) return `Ogni ${Math.round(hours * 60)} minuti`;
  if (hours === 1) return 'Ogni ora';
  const value = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `Ogni ${value} ore`;
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/components/Dashboard/account-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/account-format.ts app/components/Dashboard/account-format.test.ts
git commit -m "feat: formattazione piano e frequenza sync per la card Account"
```

---

### Task 2: Presentazione della riga "Non idonei"

**Files:**
- Create: `app/components/Dashboard/product-rows.ts`
- Test: `app/components/Dashboard/product-rows.test.ts`

**Interfaces:**
- Produces: `problemRowPresentation(problemCount: number): { tone: 'warning' | undefined; showLink: boolean }`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/components/Dashboard/product-rows.test.ts
import { describe, it, expect } from 'vitest';
import { problemRowPresentation } from './product-rows';

describe('problemRowPresentation', () => {
  it('con problemi → badge arancione e link visibile', () => {
    expect(problemRowPresentation(3)).toEqual({ tone: 'warning', showLink: true });
  });
  it('senza problemi → badge grigio e nessun link', () => {
    expect(problemRowPresentation(0)).toEqual({ tone: undefined, showLink: false });
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/components/Dashboard/product-rows.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/components/Dashboard/product-rows.ts

export interface ProblemRowPresentation {
  tone: 'warning' | undefined;
  showLink: boolean;
}

// La riga "Non idonei" e' arancione e offre il link ai dettagli solo se c'e'
// davvero qualcosa da correggere; a zero problemi resta grigia e muta.
export function problemRowPresentation(problemCount: number): ProblemRowPresentation {
  const hasProblems = problemCount > 0;
  return { tone: hasProblems ? 'warning' : undefined, showLink: hasProblems };
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/components/Dashboard/product-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/product-rows.ts app/components/Dashboard/product-rows.test.ts
git commit -m "feat: presentazione della riga Non idonei"
```

---

### Task 3: Conteggio del consenso marketing

**Files:**
- Create: `app/lib/stats/customer-consent-stats.ts`
- Test: `app/lib/stats/customer-consent-stats.test.ts`

**Interfaces:**
- Produces: `isCustomerOptedIn(customer: ShopifyCustomer): boolean`, `countMarketingConsent(customers: ShopifyCustomer[]): { optIn: number; optOut: number }`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/stats/customer-consent-stats.test.ts
import { describe, it, expect } from 'vitest';
import { countMarketingConsent, isCustomerOptedIn } from './customer-consent-stats';
import type { ShopifyCustomer } from '~/types/shopify';

const c = (over: Partial<ShopifyCustomer>): ShopifyCustomer =>
  ({ id: 1, email: null, phone: null, first_name: null, last_name: null, ...over } as ShopifyCustomer);

describe('isCustomerOptedIn', () => {
  it('consenso nidificato subscribed → true', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'subscribed' } }))).toBe(true);
  });
  it('unsubscribed → false', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'unsubscribed' } }))).toBe(false);
  });
  it('pending → false', () => {
    expect(isCustomerOptedIn(c({ email_marketing_consent: { state: 'pending' } }))).toBe(false);
  });
  it('senza consenso nidificato usa il campo legacy', () => {
    expect(isCustomerOptedIn(c({ accepts_marketing: true }))).toBe(true);
    expect(isCustomerOptedIn(c({ accepts_marketing: false }))).toBe(false);
  });
  it('nessuna informazione → false', () => {
    expect(isCustomerOptedIn(c({}))).toBe(false);
  });
});

describe('countMarketingConsent', () => {
  it('conta opt-in e opt-out', () => {
    const rows = [
      c({ email_marketing_consent: { state: 'subscribed' } }),
      c({ email_marketing_consent: { state: 'unsubscribed' } }),
      c({ accepts_marketing: true }),
    ];
    expect(countMarketingConsent(rows)).toEqual({ optIn: 2, optOut: 1 });
  });
  it('array vuoto → zeri', () => {
    expect(countMarketingConsent([])).toEqual({ optIn: 0, optOut: 0 });
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/stats/customer-consent-stats.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

```ts
// app/lib/stats/customer-consent-stats.ts
import type { ShopifyCustomer } from '~/types/shopify';

export interface MarketingConsentCounts {
  optIn: number;
  optOut: number;
}

// Stesso criterio di transformCustomer: vince il consenso nidificato quando c'e',
// altrimenti si ricade sul campo legacy per i payload piu' vecchi.
export function isCustomerOptedIn(customer: ShopifyCustomer): boolean {
  const state = customer.email_marketing_consent?.state;
  if (state != null) return state === 'subscribed';
  return customer.accepts_marketing === true;
}

export function countMarketingConsent(customers: ShopifyCustomer[]): MarketingConsentCounts {
  let optIn = 0;
  for (const customer of customers) {
    if (isCustomerOptedIn(customer)) optIn++;
  }
  return { optIn, optOut: customers.length - optIn };
}
```

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/lib/stats/customer-consent-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/stats/customer-consent-stats.ts app/lib/stats/customer-consent-stats.test.ts
git commit -m "feat: conteggio consenso marketing dei clienti"
```

---

### Task 4: Cache clienti + endpoint /api/stats/customers

**Files:**
- Modify: `app/lib/cache/stats-cache.server.ts` (aggiunta in coda)
- Create: `app/routes/api.stats.customers.tsx`
- Test: `app/routes/api.stats.customers.test.ts`

**Interfaces:**
- Consumes: `countMarketingConsent` (Task 3).
- Produces: `getCustomerStatsCache(shopId)`, `setCustomerStatsCache(shopId, stats)`; endpoint che risponde `{ enabled, totalCustomers, optIn, optOut, cached }`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/routes/api.stats.customers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueShop = vi.fn();
const findUniquePlan = vi.fn();
const getCustomers = vi.fn();
const getCustomerStatsCache = vi.fn();
const setCustomerStatsCache = vi.fn();

vi.mock('~/shopify.server', () => ({
  authenticate: { admin: async () => ({ session: { shop: 'test-shop.myshopify.com' } }) },
}));
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => findUniqueShop(...a) },
    plan: { findUnique: (...a: unknown[]) => findUniquePlan(...a) },
  },
}));
vi.mock('~/lib/shopify-api.server', () => ({
  ShopifyAPIClient: class {
    getCustomers = (...a: unknown[]) => getCustomers(...a);
  },
}));
vi.mock('~/lib/cache/stats-cache.server', () => ({
  getCustomerStatsCache: (...a: unknown[]) => getCustomerStatsCache(...a),
  setCustomerStatsCache: (...a: unknown[]) => setCustomerStatsCache(...a),
}));

import { loader } from './api.stats.customers';

const call = (url = 'https://app/api/stats/customers') =>
  loader({ request: new Request(url), params: {}, context: {} } as any);

describe('/api/stats/customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueShop.mockResolvedValue({ id: 'shop-1', shopDomain: 'test-shop.myshopify.com', accessToken: 'enc', currentPlan: 'pro' });
  });

  it('piano senza clienti → enabled false e nessuna chiamata a Shopify', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: false });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: false, optIn: 0, optOut: 0 });
    expect(getCustomers).not.toHaveBeenCalled();
  });

  it('usa la cache quando presente', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: true });
    getCustomerStatsCache.mockResolvedValue({ totalCustomers: 10, optIn: 6, optOut: 4, computedAt: 'x' });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: true, totalCustomers: 10, optIn: 6, optOut: 4, cached: true });
    expect(getCustomers).not.toHaveBeenCalled();
  });

  it('senza cache pagina Shopify e somma i conteggi', async () => {
    findUniquePlan.mockResolvedValue({ customersSyncEnabled: true });
    getCustomerStatsCache.mockResolvedValue(null);
    getCustomers
      .mockResolvedValueOnce({
        customers: [
          { id: 1, email_marketing_consent: { state: 'subscribed' } },
          { id: 2, email_marketing_consent: { state: 'unsubscribed' } },
        ],
        nextPageInfo: 'p2',
      })
      .mockResolvedValueOnce({
        customers: [{ id: 3, accepts_marketing: true }],
        nextPageInfo: null,
      });
    const res = await call();
    expect(await res.json()).toMatchObject({ enabled: true, totalCustomers: 3, optIn: 2, optOut: 1, cached: false });
    expect(setCustomerStatsCache).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/routes/api.stats.customers.test.ts`
Expected: FAIL — route e funzioni di cache non esistono.

- [ ] **Step 3: Aggiungi le funzioni di cache**

In coda a `app/lib/cache/stats-cache.server.ts`:

```ts
export interface CustomerStats {
  totalCustomers: number;
  optIn: number;
  optOut: number;
}

function customerKey(shopId: string): string {
  return `stats:customers:${shopId}`;
}

export async function getCustomerStatsCache(
  shopId: string,
): Promise<(CustomerStats & { computedAt: string }) | null> {
  try {
    const redis = await getClient();
    const raw = await redis.get(customerKey(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[stats-cache] get clienti fallito (ignoro, calcolo live):', err);
    return null;
  }
}

export async function setCustomerStatsCache(
  shopId: string,
  stats: CustomerStats,
): Promise<void> {
  try {
    const payload = JSON.stringify({ ...stats, computedAt: new Date().toISOString() });
    const redis = await getClient();
    await redis.set(customerKey(shopId), payload, 'EX', TTL_SECONDS);
  } catch (err) {
    console.error('[stats-cache] set clienti fallito (ignoro):', err);
  }
}
```

- [ ] **Step 4: Crea l'endpoint**

```tsx
// app/routes/api.stats.customers.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
import { countMarketingConsent } from '~/lib/stats/customer-consent-stats';
import {
  getCustomerStatsCache,
  setCustomerStatsCache,
} from '~/lib/cache/stats-cache.server';
import type { ShopifyCustomer } from '~/types/shopify';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) {
    throw new Response('Shop not found', { status: 404 });
  }

  // Il piano non include i clienti: nessuna chiamata a Shopify, la card e' bloccata.
  const plan = await prisma.plan.findUnique({ where: { planName: shop.currentPlan } });
  if (!plan?.customersSyncEnabled) {
    return json({ enabled: false, totalCustomers: 0, optIn: 0, optOut: 0, cached: false });
  }

  // Cache-then-refresh, come /api/stats/products: risposta immediata dalla cache e
  // ricalcolo live innescato dal client quando vede cached:true.
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  if (!refresh) {
    const cached = await getCustomerStatsCache(shop.id);
    if (cached) {
      return json({
        enabled: true,
        totalCustomers: cached.totalCustomers,
        optIn: cached.optIn,
        optOut: cached.optOut,
        cached: true,
      });
    }
  }

  const client = new ShopifyAPIClient(shop.shopDomain, shop.accessToken);

  let optIn = 0;
  let optOut = 0;
  let pageInfo: string | undefined;

  do {
    const { customers, nextPageInfo } = await client.getCustomers({ limit: 250, pageInfo });
    const counts = countMarketingConsent((customers ?? []) as ShopifyCustomer[]);
    optIn += counts.optIn;
    optOut += counts.optOut;
    pageInfo = nextPageInfo ?? undefined;
  } while (pageInfo);

  const result = { totalCustomers: optIn + optOut, optIn, optOut };
  await setCustomerStatsCache(shop.id, result);

  return json({ enabled: true, ...result, cached: false });
}
```

- [ ] **Step 5: Verifica il pass**

Run: `npx vitest run app/routes/api.stats.customers.test.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add app/lib/cache/stats-cache.server.ts app/routes/api.stats.customers.tsx app/routes/api.stats.customers.test.ts
git commit -m "feat: endpoint statistiche consenso clienti con cache"
```

---

### Task 5: Primitiva MetricRow (Polaris)

**Files:**
- Create: `app/components/Dashboard/MetricRow.tsx`

**Interfaces:**
- Produces: `MetricRow` con props `{ label: string; badge: { tone?: 'success' | 'warning'; content: string }; info?: string; action?: ReactNode }`

- [ ] **Step 1: Implementa il componente**

Solo Polaris. L'etichetta sta a sinistra, l'azione opzionale e il badge a destra: cosi' l'azione cade **tra** etichetta e numero, come una colonna a se'.

```tsx
// app/components/Dashboard/MetricRow.tsx
import type { ReactNode } from 'react';
import { InlineStack, Badge, Text, Icon, Tooltip } from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';

export interface MetricRowProps {
  label: string;
  badge: { tone?: 'success' | 'warning'; content: string };
  info?: string;
  action?: ReactNode;
}

// Riga singola delle card della dashboard: etichetta (con eventuale info),
// azione opzionale, badge. Estratta perche' si ripete identica nelle tre card e
// tiene i badge allineati sulla stessa colonna.
export function MetricRow({ label, badge, info, action }: MetricRowProps) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
      <InlineStack gap="100" blockAlign="center" wrap={false}>
        <Text as="span" variant="bodyMd">
          {label}
        </Text>
        {info ? (
          <Tooltip content={info}>
            <Icon source={InfoIcon} tone="subdued" />
          </Tooltip>
        ) : null}
      </InlineStack>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        {action}
        <Badge tone={badge.tone}>{badge.content}</Badge>
      </InlineStack>
    </InlineStack>
  );
}
```

- [ ] **Step 2: Verifica typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore; build client e server verdi. (Non esistono test di componenti: vedi Global Constraints.)

- [ ] **Step 3: Commit**

```bash
git add app/components/Dashboard/MetricRow.tsx
git commit -m "feat: primitiva MetricRow per le card della dashboard"
```

---

### Task 6: Le tre card (Polaris)

**Files:**
- Create: `app/components/Dashboard/AccountCard.tsx`
- Create: `app/components/Dashboard/ProductsCard.tsx`
- Create: `app/components/Dashboard/CustomersCard.tsx`

**Interfaces:**
- Consumes: `MetricRow` (Task 5), `planLabel`/`syncFrequencyLabel` (Task 1), `problemRowPresentation` (Task 2).
- Produces: `AccountCard`, `ProductsCard`, `CustomersCard` con le props indicate sotto.

- [ ] **Step 1: AccountCard**

```tsx
// app/components/Dashboard/AccountCard.tsx
import { Card, BlockStack, Text } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { planLabel, syncFrequencyLabel } from './account-format';

export interface AccountCardProps {
  connected: boolean;
  planName: string;
  syncFrequencyHours: number | null;
}

export function AccountCard({ connected, planName, syncFrequencyHours }: AccountCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Account
        </Text>
        <MetricRow
          label="Database"
          badge={{
            tone: connected ? 'success' : undefined,
            content: connected ? 'Collegato' : 'Non collegato',
          }}
        />
        <MetricRow label="Piano" badge={{ content: planLabel(planName) }} />
        <MetricRow
          label="Frequenza sync"
          badge={{ content: syncFrequencyLabel(syncFrequencyHours) }}
        />
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 2: ProductsCard**

```tsx
// app/components/Dashboard/ProductsCard.tsx
import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { problemRowPresentation } from './product-rows';

export interface ProductsCardProps {
  readyCount: number;
  problemCount: number;
  loading: boolean;
  onViewIssues: () => void;
}

export function ProductsCard({
  readyCount,
  problemCount,
  loading,
  onViewIssues,
}: ProductsCardProps) {
  // Il totale e' la somma per costruzione: idonei + non idonei.
  const total = readyCount + problemCount;
  const { tone, showLink } = problemRowPresentation(problemCount);
  const value = (n: number) => (loading ? '—' : String(n));

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Prodotti
        </Text>
        <MetricRow label="Prodotti totali" badge={{ content: value(total) }} />
        <MetricRow
          label="Prodotti idonei"
          badge={{ tone: 'success', content: value(readyCount) }}
        />
        <MetricRow
          label="Non idonei"
          action={
            showLink && !loading ? (
              <Button variant="plain" onClick={onViewIssues}>
                Vedi prodotti
              </Button>
            ) : undefined
          }
          badge={{ tone, content: value(problemCount) }}
        />
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 3: CustomersCard**

L'overlay e' l'unica eccezione al vincolo Polaris (gradiente, `aria-hidden`, `pointer-events`), incapsulata dentro un `Box` Polaris e documentata.

Nota: il codice sotto usa `<Box position="relative">`. Se la versione di Polaris installata non espone la prop `position` su `Box` (`tsc` lo direbbe subito), sostituisci quel solo elemento con un `div` con `style={{ position: 'relative' }}`, facendolo rientrare nella stessa eccezione documentata — **senza** toccare il resto del markup Polaris.

```tsx
// app/components/Dashboard/CustomersCard.tsx
import { Card, BlockStack, Text, Button, Tooltip, Box } from '@shopify/polaris';
import { MetricRow } from './MetricRow';

const OPT_IN_INFO = 'Qui vengono identificati i clienti che hanno acconsentito al marketing';
const OPT_OUT_INFO = 'Qui vengono identificati i clienti che non hanno acconsentito al marketing';

export interface CustomersCardProps {
  enabled: boolean;
  totalCustomers: number;
  optIn: number;
  optOut: number;
  loading: boolean;
}

export function CustomersCard({
  enabled,
  totalCustomers,
  optIn,
  optOut,
  loading,
}: CustomersCardProps) {
  const value = (n: number) => (loading ? '—' : String(n));

  const rows = (
    <BlockStack gap="300">
      <MetricRow label="Clienti totali" badge={{ content: value(totalCustomers) }} />
      <MetricRow
        label="Clienti opt-in"
        info={OPT_IN_INFO}
        badge={{ tone: 'success', content: value(optIn) }}
      />
      <MetricRow label="Clienti opt-out" info={OPT_OUT_INFO} badge={{ content: value(optOut) }} />
    </BlockStack>
  );

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Clienti
        </Text>
        {enabled ? (
          rows
        ) : (
          <Box position="relative">
            {/* Contenuto reale ma inerte: non deve essere raggiungibile da tastiera
                ne' letto dagli screen reader, perche' mostra numeri che il piano
                corrente non da' diritto di vedere. */}
            <div aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {rows}
            </div>
            {/* Velo che sfuma dal 40% in alto (prime righe intraviste) all'opaco in
                basso. Polaris non ha un token per i gradienti: unica eccezione. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Tooltip content="Presto disponibile">
                <Button variant="primary" disabled>
                  Aggiorna piano
                </Button>
              </Tooltip>
            </div>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
```

- [ ] **Step 4: Verifica typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore; build verdi.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/AccountCard.tsx app/components/Dashboard/ProductsCard.tsx app/components/Dashboard/CustomersCard.tsx
git commit -m "feat: card Account, Prodotti e Clienti della dashboard"
```

---

### Task 7: Integrazione nella dashboard + totalVariants

**Files:**
- Modify: `app/routes/api.stats.products.tsx` (aggiunta `totalVariants` nella risposta)
- Modify: `app/routes/_index.tsx` (loader: espone `maxSyncFrequencyHours`; componente: sostituisce le 4 StatsCard, aggiunge il fetcher clienti)

**Interfaces:**
- Consumes: `AccountCard`, `ProductsCard`, `CustomersCard` (Task 6); endpoint `/api/stats/customers` (Task 4).

- [ ] **Step 1: Aggiungi `totalVariants` a /api/stats/products**

In `app/routes/api.stats.products.tsx`, nel ramo cache (riga ~28) e nel ritorno finale (riga ~67), esponi il totale varianti esplicito invece di lasciare l'addizione alla UI. Sostituisci il blocco cache con:

```tsx
    const cached = await getReadinessCache(shop.id);
    if (cached) {
      return json({
        totalProducts: cached.totalProducts,
        totalVariants: cached.readyCount + cached.problemCount,
        readyCount: cached.readyCount,
        problemCount: cached.problemCount,
        cached: true,
      });
    }
```

e il ritorno finale con:

```tsx
  return json({ ...result, totalVariants: readyCount + problemCount, cached: false });
```

- [ ] **Step 2: Esponi la frequenza del piano nel loader della dashboard**

In `app/routes/_index.tsx`, nel `return json({...})` del loader (riga ~89), aggiungi il campo:

```tsx
      syncFrequencyHours: plan?.maxSyncFrequencyHours ?? null,
```

- [ ] **Step 3: Aggiungi il fetcher dei clienti nel componente**

In `app/routes/_index.tsx`, accanto ai fetcher esistenti, aggiungi l'interfaccia e il fetcher:

```tsx
interface CustomerStatsResponse {
  enabled: boolean;
  totalCustomers: number;
  optIn: number;
  optOut: number;
  cached?: boolean;
}
```

```tsx
  const customerStatsFetcher = useFetcher<CustomerStatsResponse>();
  const customerStatsRefreshFetcher = useFetcher<CustomerStatsResponse>();
```

Nel `useEffect` di montaggio esistente aggiungi la load:

```tsx
    customerStatsFetcher.load('/api/stats/customers');
```

E un effetto di refresh gemello di quello della readiness:

```tsx
  useEffect(() => {
    if (customerStatsFetcher.data?.cached) {
      customerStatsRefreshFetcher.load('/api/stats/customers?refresh=1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerStatsFetcher.data]);
```

e la selezione del valore vivo:

```tsx
  const customerStats = customerStatsRefreshFetcher.data ?? customerStatsFetcher.data;
  const customerStatsLoading = !customerStats;
```

- [ ] **Step 4: Sostituisci le quattro StatsCard con le tre card**

In `app/routes/_index.tsx` sostituisci l'intero blocco `<InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400"> … </InlineGrid>` (righe ~407-459) con:

```tsx
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <AccountCard
            connected={supabaseConnected}
            planName={shop.currentPlan}
            syncFrequencyHours={syncFrequencyHours}
          />
          <ProductsCard
            readyCount={readiness?.readyCount ?? 0}
            problemCount={readiness?.problemCount ?? 0}
            loading={readinessLoading}
            onViewIssues={() => navigate('/products/issues')}
          />
          <CustomersCard
            enabled={customersEnabled}
            totalCustomers={customerStats?.totalCustomers ?? 0}
            optIn={customerStats?.optIn ?? 0}
            optOut={customerStats?.optOut ?? 0}
            loading={customerStatsLoading}
          />
        </InlineGrid>
```

Aggiungi gli import dei tre componenti e aggiungi `syncFrequencyHours` alla destrutturazione di `useLoaderData`.

Poi ripulisci gli import diventati orfani. **Attenzione: `tsc` NON segnala gli import inutilizzati in questo progetto** (`noUnusedLocals` non e' attivo), quindi vanno verificati a mano:

```bash
# StatsCard e' sicuramente orfano dopo questa sostituzione
grep -n "StatsCard" app/routes/_index.tsx
# Questi erano usati dalle vecchie card: verifica se restano usati altrove nel file
for s in Tooltip Box Icon SkeletonDisplayText; do echo "--- $s"; grep -n "<$s\|$s\." app/routes/_index.tsx; done
```

Rimuovi dall'import solo i simboli che non compaiono piu' in alcun uso.

- [ ] **Step 5: Verifica completa**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti i test verdi, nessun errore di tipo, build verdi.

- [ ] **Step 6: Commit**

```bash
git add app/routes/_index.tsx app/routes/api.stats.products.tsx
git commit -m "feat: dashboard con le tre card Account, Prodotti e Clienti"
```

---

## Note di verifica manuale (post-deploy)

- Le tre card stanno sulla stessa riga su desktop e si impilano su mobile.
- Con prodotti non idonei: badge arancione e link "Vedi prodotti" che porta alla tab dei problemi; con zero non idonei: badge grigio e nessun link.
- Su piano free: card Clienti velata col pulsante "Aggiorna piano" disabilitato al centro.

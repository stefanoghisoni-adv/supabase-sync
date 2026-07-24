# Tab "Piano" (slice 1: solo UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere una tab "Piano" che presenta i 4 piani (Free/Pro/Business/Enterprise) come pricing table, con Pro consigliato e feature verdi/grigie ordinate, e allineare la frequenza reale del Free a 7 giorni.

**Architecture:** Catalogo piani/feature in un config tipizzato in codice (`app/components/Billing/`), un helper puro per l'ordinamento delle feature (testato), un componente Polaris di rendering e una route Remix. Nessuna chiamata a Shopify Billing: il CTA è un placeholder.

**Tech Stack:** Remix 2 (flat routes), Shopify Polaris 13, `@shopify/polaris-icons`, Prisma, Vitest (ambiente `node`, solo logica pura).

## Global Constraints

- Slice **solo UI di presentazione**: CTA placeholder, **nessuna** Shopify Billing API, nessun addebito.
- **Solo Polaris**: niente `div`/CSS custom se esiste un componente Polaris.
- Prezzi mensili esatti: Free `0`, Pro `29`, Business `99`, Enterprise `299`.
- **Un solo** piano consigliato: **Pro** (`recommended: true`).
- Feature **incluse** = `CheckIcon` + `tone="success"` (verde); **non incluse** = `XIcon` + `tone="subdued"` (grigio). Le verdi vanno **in alto**, le grigie in fondo. Stesso set di **5 feature** su ogni card.
- NavMenu: voce **Piano** posizionata **subito prima di Impostazioni** (ordine: Dashboard, Prodotti con problemi, Logs, Piano, Impostazioni).
- Free: frequenza sync reale a **168h (7 giorni)** — seed + UPDATE DB live + label giorni.
- Copy e commenti in **italiano**.
- Niente test di componenti TSX (nessuna infra RTL/jsdom): i `.tsx` si verificano con `npx tsc --noEmit`; la logica pura ha test Vitest.

---

## File Structure

- Create: `app/components/Billing/plan-catalog.ts` — tipi `PlanId`/`PlanFeature`/`PlanCard` + dato `PLAN_CATALOG`.
- Create: `app/components/Billing/plan-catalog.test.ts` — integrità del catalogo.
- Create: `app/components/Billing/plan-features.ts` — `sortFeatures` (verdi prima, stabile).
- Create: `app/components/Billing/plan-features.test.ts`.
- Create: `app/components/Billing/PlanFeatureList.tsx` — rendering feature con icone.
- Create: `app/routes/plan.tsx` — route della tab Piano.
- Modify: `app/root.tsx` — voce "Piano" in `NavMenu` (in `App()` e in `ErrorBoundary()`).
- Modify: `prisma/seed.ts` — Free `maxSyncFrequencyHours` `24` → `168`.
- Modify: `app/components/Dashboard/account-format.ts` — `syncFrequencyLabel` rende i multipli di 24h come giorni.
- Modify: `app/components/Dashboard/account-format.test.ts` — casi giorni.

---

## Task 1: Free → 7 giorni (label + seed + DB live)

**Files:**
- Modify: `app/components/Dashboard/account-format.ts`
- Modify: `app/components/Dashboard/account-format.test.ts`
- Modify: `prisma/seed.ts:16`

**Interfaces:**
- Consumes: nulla.
- Produces: `syncFrequencyLabel(hours)` invariata nella firma; nuovo comportamento per i multipli di 24h.

- [ ] **Step 1: Aggiungi i test che falliscono** — in coda a `app/components/Dashboard/account-format.test.ts` (l'import di `syncFrequencyLabel` è già presente nel file):

```ts
describe('syncFrequencyLabel — giorni', () => {
  it('rende i multipli esatti di 24h come giorni', () => {
    expect(syncFrequencyLabel(168)).toBe('Ogni 7 giorni');
    expect(syncFrequencyLabel(24)).toBe('Ogni giorno');
    expect(syncFrequencyLabel(48)).toBe('Ogni 2 giorni');
  });

  it('lascia invariati i casi ore/minuti (e i non-multipli di 24)', () => {
    expect(syncFrequencyLabel(6)).toBe('Ogni 6 ore');
    expect(syncFrequencyLabel(1)).toBe('Ogni ora');
    expect(syncFrequencyLabel(0.5)).toBe('Ogni 30 minuti');
    expect(syncFrequencyLabel(30)).toBe('Ogni 30 ore');
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run app/components/Dashboard/account-format.test.ts`
Expected: FAIL — `syncFrequencyLabel(168)` restituisce `'Ogni 168 ore'`, atteso `'Ogni 7 giorni'`.

- [ ] **Step 3: Implementa il ramo "giorni"** — in `app/components/Dashboard/account-format.ts`, sostituisci la funzione `syncFrequencyLabel` con:

```ts
// Plan.maxSyncFrequencyHours e' un Float: sotto l'ora si legge meglio in minuti,
// sopra le 24 ore (multipli esatti) in giorni ("Ogni 7 giorni" invece di "168 ore").
export function syncFrequencyLabel(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 1) return `Ogni ${Math.round(hours * 60)} minuti`;
  if (hours === 1) return 'Ogni ora';
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'Ogni giorno' : `Ogni ${days} giorni`;
  }
  const value = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `Ogni ${value} ore`;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run app/components/Dashboard/account-format.test.ts`
Expected: PASS (tutti i casi, vecchi e nuovi).

- [ ] **Step 5: Aggiorna il seed** — in `prisma/seed.ts`, nel blocco del piano `free`, cambia `maxSyncFrequencyHours: 24,` in `maxSyncFrequencyHours: 168,`.

- [ ] **Step 6: Typecheck e commit**

```bash
npx tsc --noEmit
git add app/components/Dashboard/account-format.ts app/components/Dashboard/account-format.test.ts prisma/seed.ts
git commit -m "feat(plans): frequenza Free a 7 giorni (label giorni + seed 168h)"
```

- [ ] **Step 7: UPDATE del DB live (ESEGUE L'UTENTE in produzione)**

Il seed usa `createMany({ skipDuplicates: true })`: la riga `free` già esistente **non** viene aggiornata. Sul DB di produzione va eseguita una volta:

```sql
UPDATE plans SET max_sync_frequency_hours = 168 WHERE plan_name = 'free';
```

Senza questa UPDATE, i negozi Free continuano a sincronizzare ogni 24h mentre la vetrina annuncia 7 giorni.

---

## Task 2: Catalogo piani (`plan-catalog.ts`)

**Files:**
- Create: `app/components/Billing/plan-catalog.ts`
- Test: `app/components/Billing/plan-catalog.test.ts`

**Interfaces:**
- Consumes: nulla.
- Produces:
  - `type PlanId = 'free' | 'pro' | 'business' | 'enterprise'`
  - `interface PlanFeature { label: string; included: boolean }`
  - `interface PlanCard { id: PlanId; name: string; priceMonthly: number; recommended: boolean; features: PlanFeature[] }`
  - `const PLAN_CATALOG: PlanCard[]` (ordine free, pro, business, enterprise).

- [ ] **Step 1: Scrivi il test che fallisce** — `app/components/Billing/plan-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PLAN_CATALOG } from './plan-catalog';

describe('PLAN_CATALOG', () => {
  it('contiene i 4 piani nell ordine free, pro, business, enterprise', () => {
    expect(PLAN_CATALOG.map((p) => p.id)).toEqual(['free', 'pro', 'business', 'enterprise']);
  });

  it('ha esattamente un piano consigliato ed e Pro', () => {
    const rec = PLAN_CATALOG.filter((p) => p.recommended);
    expect(rec).toHaveLength(1);
    expect(rec[0].id).toBe('pro');
  });

  it('i prezzi mensili sono 0/29/99/299', () => {
    expect(PLAN_CATALOG.map((p) => p.priceMonthly)).toEqual([0, 29, 99, 299]);
  });

  it('ogni piano ha 5 feature', () => {
    for (const p of PLAN_CATALOG) expect(p.features).toHaveLength(5);
  });

  it('Free non include push manuale ne sync clienti', () => {
    const free = PLAN_CATALOG.find((p) => p.id === 'free')!;
    const push = free.features.find((f) => f.label.toLowerCase().includes('push manuale'))!;
    const cust = free.features.find((f) => f.label.toLowerCase().includes('sync clienti'))!;
    expect(push.included).toBe(false);
    expect(cust.included).toBe(false);
  });

  it('Pro non include push manuale ma include sync clienti', () => {
    const pro = PLAN_CATALOG.find((p) => p.id === 'pro')!;
    expect(pro.features.find((f) => f.label.toLowerCase().includes('push manuale'))!.included).toBe(false);
    expect(pro.features.find((f) => f.label.toLowerCase().includes('sync clienti'))!.included).toBe(true);
  });

  it('Business include push manuale', () => {
    const biz = PLAN_CATALOG.find((p) => p.id === 'business')!;
    expect(biz.features.find((f) => f.label.toLowerCase().includes('push manuale'))!.included).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/components/Billing/plan-catalog.test.ts`
Expected: FAIL — `Cannot find module './plan-catalog'`.

- [ ] **Step 3: Implementa il catalogo** — `app/components/Billing/plan-catalog.ts`:

```ts
// Catalogo di presentazione della tab Piano. NON e' la fonte dei limiti tecnici
// di billing (quelli vivono nel modello Plan): qui e' solo copy commerciale, cosi'
// possiamo elencare anche feature senza campo nel DB (es. "Push manuale").
export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export interface PlanFeature {
  label: string;
  included: boolean; // true = SI (verde), false = NO (grigio)
}

export interface PlanCard {
  id: PlanId;
  name: string;
  priceMonthly: number; // euro, intero
  recommended: boolean; // true solo per Pro
  features: PlanFeature[];
}

export const PLAN_CATALOG: PlanCard[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    recommended: false,
    features: [
      { label: 'Fino a 50 prodotti', included: true },
      { label: 'Sync automatica ogni 7 giorni', included: true },
      { label: 'Push manuale', included: false },
      { label: 'Sync clienti', included: false },
      { label: 'Supporto via email', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    recommended: true,
    features: [
      { label: 'Fino a 100 prodotti', included: true },
      { label: 'Sync automatica ogni 6 ore', included: true },
      { label: 'Push manuale', included: false },
      { label: 'Sync clienti fino a 5.000', included: true },
      { label: 'Supporto via email', included: true },
    ],
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 99,
    recommended: false,
    features: [
      { label: 'Fino a 400 prodotti', included: true },
      { label: 'Sync automatica ogni ora', included: true },
      { label: 'Push manuale', included: true },
      { label: 'Sync clienti fino a 50.000', included: true },
      { label: 'Supporto via chat dedicata', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 299,
    recommended: false,
    features: [
      { label: 'Prodotti illimitati', included: true },
      { label: 'Sync automatica ogni 30 minuti', included: true },
      { label: 'Push manuale', included: true },
      { label: 'Sync clienti illimitati', included: true },
      { label: 'Supporto via chat dedicata', included: true },
    ],
  },
];
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run app/components/Billing/plan-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Billing/plan-catalog.ts app/components/Billing/plan-catalog.test.ts
git commit -m "feat(plans): catalogo di presentazione dei 4 piani"
```

---

## Task 3: Ordinamento feature (`plan-features.ts`)

**Files:**
- Create: `app/components/Billing/plan-features.ts`
- Test: `app/components/Billing/plan-features.test.ts`

**Interfaces:**
- Consumes: `PlanFeature` da `./plan-catalog` (Task 2).
- Produces: `sortFeatures(features: PlanFeature[]): PlanFeature[]` — nuova lista con le incluse prima, stabile, senza mutare l'input.

- [ ] **Step 1: Scrivi il test che fallisce** — `app/components/Billing/plan-features.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortFeatures } from './plan-features';
import type { PlanFeature } from './plan-catalog';

describe('sortFeatures', () => {
  it('mette le incluse (verdi) prima delle non incluse (grigie)', () => {
    const input: PlanFeature[] = [
      { label: 'A', included: false },
      { label: 'B', included: true },
      { label: 'C', included: false },
      { label: 'D', included: true },
    ];
    expect(sortFeatures(input).map((f) => f.label)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('e stabile: preserva l ordine originale dentro ciascun gruppo', () => {
    const input: PlanFeature[] = [
      { label: '1', included: true },
      { label: '2', included: true },
      { label: '3', included: true },
    ];
    expect(sortFeatures(input).map((f) => f.label)).toEqual(['1', '2', '3']);
  });

  it('gestisce la lista vuota', () => {
    expect(sortFeatures([])).toEqual([]);
  });

  it('non muta l input', () => {
    const input: PlanFeature[] = [
      { label: 'X', included: false },
      { label: 'Y', included: true },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    sortFeatures(input);
    expect(input).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run app/components/Billing/plan-features.test.ts`
Expected: FAIL — `Cannot find module './plan-features'`.

- [ ] **Step 3: Implementa l'helper** — `app/components/Billing/plan-features.ts`:

```ts
import type { PlanFeature } from './plan-catalog';

// Le feature incluse (verdi) vanno mostrate prima delle non incluse (grigie).
// Array.prototype.sort e' stabile (Node >= 11), quindi l'ordine di catalogo si
// conserva dentro ciascun gruppo. Copiamo l'array per non mutare l'input.
export function sortFeatures(features: PlanFeature[]): PlanFeature[] {
  return [...features].sort((a, b) => Number(b.included) - Number(a.included));
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run app/components/Billing/plan-features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/Billing/plan-features.ts app/components/Billing/plan-features.test.ts
git commit -m "feat(plans): sortFeatures (verdi in alto, stabile)"
```

---

## Task 4: Componente `PlanFeatureList`

**Files:**
- Create: `app/components/Billing/PlanFeatureList.tsx`

**Interfaces:**
- Consumes: `PlanFeature` (Task 2), `sortFeatures` (Task 3), `CheckIcon`/`XIcon` da `@shopify/polaris-icons`.
- Produces: `PlanFeatureList({ features }: { features: PlanFeature[] })` — lista Polaris delle feature ordinate.

Nota: nessun test unitario (niente infra RTL; la logica di ordinamento e' gia' coperta da `sortFeatures`). Verifica con `tsc`.

- [ ] **Step 1: Implementa il componente** — `app/components/Billing/PlanFeatureList.tsx`:

```tsx
import { BlockStack, InlineStack, Icon, Text } from '@shopify/polaris';
import { CheckIcon, XIcon } from '@shopify/polaris-icons';
import type { PlanFeature } from './plan-catalog';
import { sortFeatures } from './plan-features';

interface Props {
  features: PlanFeature[];
}

// Feature incluse in verde con la spunta, non incluse in grigio con la X; le
// verdi vengono ordinate in alto da sortFeatures.
export function PlanFeatureList({ features }: Props) {
  const sorted = sortFeatures(features);
  return (
    <BlockStack gap="200">
      {sorted.map((feature, index) => (
        <InlineStack key={`${feature.label}-${index}`} gap="200" blockAlign="center" wrap={false}>
          <Icon
            source={feature.included ? CheckIcon : XIcon}
            tone={feature.included ? 'success' : 'subdued'}
          />
          <Text as="span" tone={feature.included ? 'success' : 'subdued'}>
            {feature.label}
          </Text>
        </InlineStack>
      ))}
    </BlockStack>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/components/Billing/PlanFeatureList.tsx
git commit -m "feat(plans): PlanFeatureList (spunta verde / X grigia)"
```

---

## Task 5: Route `plan.tsx` + voce NavMenu

**Files:**
- Create: `app/routes/plan.tsx`
- Modify: `app/root.tsx` (NavMenu in `App()` e in `ErrorBoundary()`)

**Interfaces:**
- Consumes: `PLAN_CATALOG` (Task 2), `PlanFeatureList` (Task 4), `authenticate` (`~/shopify.server`), `prisma` (`~/db.server`).
- Produces: rotta `/plan`.

- [ ] **Step 1: Implementa la route** — `app/routes/plan.tsx`:

```tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useNavigation } from '@remix-run/react';
import {
  Page,
  InlineGrid,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Badge,
  Button,
} from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { PLAN_CATALOG } from '~/components/Billing/plan-catalog';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  // Normalizzato in minuscolo per combaciare con gli id del catalogo. Se il piano
  // corrente non e' tra i 4 (es. 'lifetime'), nessuna card risultera' "attuale".
  return json({ currentPlan: (shop?.currentPlan ?? '').toLowerCase() });
}

export default function Plan() {
  const { currentPlan } = useLoaderData<typeof loader>();

  // Stesso comportamento di Dashboard/Logs: spinner + disabilita mentre Remix
  // carica /settings/supabase.
  const navigation = useNavigation();
  const loadingSettings =
    navigation.state === 'loading' &&
    navigation.location?.pathname === '/settings/supabase';

  return (
    <Page
      title="Piano"
      secondaryActions={[
        {
          content: 'Impostazioni',
          icon: SettingsIcon,
          url: '/settings/supabase',
          accessibilityLabel: 'Impostazioni',
          disabled: loadingSettings,
          loading: loadingSettings,
        },
      ]}
    >
      <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
        {PLAN_CATALOG.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            // Pro risaltato con la superficie selezionata Polaris (niente CSS custom).
            <Card
              key={plan.id}
              background={plan.recommended ? 'bg-surface-selected' : undefined}
            >
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    {plan.name}
                  </Text>
                  {plan.recommended && <Badge tone="success">Consigliato</Badge>}
                  {isCurrent && <Badge tone="info">Piano attuale</Badge>}
                </InlineStack>

                <InlineStack gap="100" blockAlign="baseline">
                  <Text as="span" variant="headingLg">
                    €{plan.priceMonthly}
                  </Text>
                  <Text as="span" tone="subdued">
                    /mese
                  </Text>
                </InlineStack>

                <PlanFeatureList features={plan.features} />

                {/* CTA placeholder: nessuna azione reale finche' non colleghiamo
                    Shopify Billing (slice successiva). */}
                <Button
                  variant={plan.recommended ? 'primary' : undefined}
                  disabled={isCurrent}
                  fullWidth
                >
                  {isCurrent ? 'Piano attuale' : `Scegli ${plan.name}`}
                </Button>
              </BlockStack>
            </Card>
          );
        })}
      </InlineGrid>

      {/* Respiro in fondo, come le altre tab. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
```

- [ ] **Step 2: Aggiungi la voce NavMenu** — in `app/root.tsx`, in **entrambe** le `NavMenu` (dentro `App()` e dentro `ErrorBoundary()`), inserisci il link `Piano` **prima** di quello `Impostazioni`:

```tsx
            <Link to="/logs">Logs</Link>
            <Link to="/plan">Piano</Link>
            <Link to="/settings/supabase">Impostazioni</Link>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Verifica l'intera suite**

Run: `npx vitest run`
Expected: PASS (inclusi i test di Task 1/2/3).

- [ ] **Step 5: Commit**

```bash
git add app/routes/plan.tsx app/root.tsx
git commit -m "feat(plans): tab Piano con pricing table + voce NavMenu"
```

---

## Verifica finale (dopo tutti i task)

- [ ] `npx tsc --noEmit` pulito.
- [ ] `npx vitest run` verde.
- [ ] `git push` (Vercel deploya in automatico).
- [ ] Ricordare all'utente la **UPDATE DB live** del Task 1 Step 7 (Free a 168h in produzione).
- [ ] Nota di verifica visiva: la card Pro deve risultare risaltata (superficie selezionata + badge "Consigliato"); nella card del piano corrente il bottone e' disabilitato con "Piano attuale"; in ogni card le feature verdi stanno sopra le grigie.

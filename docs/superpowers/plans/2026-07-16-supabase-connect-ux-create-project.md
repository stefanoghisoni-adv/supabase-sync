# Step 1 UX Overhaul + Supabase Project Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rifinire lo Step 1 (spinner interno al pulsante, dropdown Polaris custom a metà larghezza, pulsante Disconnetti) e aggiungere la creazione completa di un progetto Supabase dall'app (nome + region + password auto-generata, polling del provisioning, Rigenera password, storage cifrato).

**Architecture:** Estende il client Management API (`app/lib/supabase-management.server.ts`) con organizzazioni, region, creazione progetto, stato progetto e reset password. Aggiunge 5 route autenticate. Rielabora il componente `SupabaseConnect` in tre stati (non connesso / connesso-senza-progetto / collegato). Il provisioning (~1-2 min) è gestito con **polling lato client** perché le serverless Vercel hanno timeout breve.

**Tech Stack:** Remix (loader/action, resource routes, useFetcher, useRevalidator), Shopify Polaris 13 (Combobox, Listbox, TextField, ProgressBar, Icon), Prisma, Supabase Management API, AES-256-GCM (`encrypt`/`decrypt`), Vitest (fetch mockato).

## Global Constraints

- Base Management API: `https://api.supabase.com`, header `Authorization: Bearer <access_token>`. Costante esistente `MGMT_BASE` nel client.
- Cifratura: `encrypt`/`decrypt` da `~/utils/crypto.server` (AES-256-GCM). Password DB e chiavi SEMPRE cifrate a riposo, MAI loggate.
- Log server: sanitizzati — `console.error('[tag]', e instanceof Error ? e.message : 'errore sconosciuto')`. Mai rilanciare testo grezzo al client.
- Tutte le route sono autenticate con `authenticate.admin(request)`; lookup shop via `prisma.shop.findUnique({ where: { shopDomain: session.shop } })`; 404 se assente.
- Nessun `@testing-library/react` nel progetto: i componenti si verificano con `npm run typecheck` + prova manuale. Le funzioni del client Management si testano con `global.fetch = vi.fn()`.
- Pulsanti mai a larghezza piena; il dropdown progetti è largo ~50%.
- Scope OAuth attuali: Database RW, Secrets R, Projects R. **`createProject` potrebbe richiedere Projects: Write** — se la creazione restituisce 403, è un prerequisito di rollout (aggiornare la OAuth App + ri-consenso). Le route devono restituire un errore chiaro in quel caso.

---

### Task 1: Colonne `supabase_configs` per progetto merchant

**Files:**
- Modify: `prisma/schema.prisma` (model `SupabaseConfig`)
- Create: `prisma/migrations/<timestamp>_add_supabase_project_fields/migration.sql`

**Interfaces:**
- Produces: campi Prisma `supabaseDbPassword: String?`, `supabaseProjectRef: String?` su `SupabaseConfig`, mappati a `supabase_db_password` / `supabase_project_ref`.

- [ ] **Step 1: Aggiungere le colonne al model**

In `prisma/schema.prisma`, dentro `model SupabaseConfig`, subito dopo `supabaseServiceRoleKey`:

```prisma
  supabaseDbPassword     String?  @map("supabase_db_password")
  supabaseProjectRef     String?  @map("supabase_project_ref")
```

- [ ] **Step 2: Creare la migrazione**

```bash
npx prisma migrate dev --name add_supabase_project_fields --create-only
```

Se il comando non può connettersi al DB, crea a mano `prisma/migrations/<timestamp>_add_supabase_project_fields/migration.sql` con:

```sql
ALTER TABLE "supabase_configs" ADD COLUMN "supabase_db_password" TEXT;
ALTER TABLE "supabase_configs" ADD COLUMN "supabase_project_ref" TEXT;
```

- [ ] **Step 3: Rigenerare il client Prisma e verificare i tipi**

Run: `npx prisma generate && npm run typecheck`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add merchant project fields to supabase_configs"
```

---

### Task 2: Generatore password DB

**Files:**
- Create: `app/lib/password.server.ts`
- Test: `app/lib/password.test.ts`

**Interfaces:**
- Produces: `generateDbPassword(length?: number): string` — password casuale forte (default 24 caratteri, mix maiuscole/minuscole/cifre/simboli URL-safe), usando `crypto.randomBytes`.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
// app/lib/password.test.ts
import { describe, it, expect } from 'vitest';
import { generateDbPassword } from './password.server';

describe('generateDbPassword', () => {
  it('genera una password della lunghezza richiesta', () => {
    expect(generateDbPassword(24)).toHaveLength(24);
    expect(generateDbPassword(32)).toHaveLength(32);
  });

  it('usa un default di 24 caratteri', () => {
    expect(generateDbPassword()).toHaveLength(24);
  });

  it('genera valori diversi a ogni chiamata', () => {
    expect(generateDbPassword()).not.toBe(generateDbPassword());
  });

  it('contiene almeno una minuscola, una maiuscola e una cifra', () => {
    const p = generateDbPassword(40);
    expect(p).toMatch(/[a-z]/);
    expect(p).toMatch(/[A-Z]/);
    expect(p).toMatch(/[0-9]/);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificarne il fallimento**

Run: `npm test -- --run app/lib/password.test.ts`
Expected: FAIL ("generateDbPassword is not a function" / modulo mancante).

- [ ] **Step 3: Implementare**

```typescript
// app/lib/password.server.ts
import { randomBytes } from 'crypto';

// Charset senza caratteri ambigui e sicuro per stringhe di connessione Postgres.
const CHARSET =
  'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

export function generateDbPassword(length = 24): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  // Garantisce almeno una minuscola, una maiuscola e una cifra.
  if (!/[a-z]/.test(out)) out = 'a' + out.slice(1);
  if (!/[A-Z]/.test(out)) out = out.slice(0, 1) + 'A' + out.slice(2);
  if (!/[0-9]/.test(out)) out = out.slice(0, 2) + '2' + out.slice(3);
  return out;
}
```

- [ ] **Step 4: Eseguire i test e verificarne il successo**

Run: `npm test -- --run app/lib/password.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/password.server.ts app/lib/password.test.ts
git commit -m "feat: add strong DB password generator"
```

---

### Task 3: Management — `listOrganizations`

**Files:**
- Modify: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Consumes: `MGMT_BASE`, `global.fetch`.
- Produces: `interface SupabaseOrganization { id: string; name: string }`; `listOrganizations(accessToken: string): Promise<SupabaseOrganization[]>` (GET `/v1/organizations`).

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungi in `app/lib/supabase-management.test.ts` (e importa `listOrganizations`):

```typescript
describe('listOrganizations', () => {
  it('GET /v1/organizations e mappa id/name', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'org1', name: 'Stefano Ghisoni', extra: 1 }],
    });
    const orgs = await listOrganizations('tok');
    expect(orgs).toEqual([{ id: 'org1', name: 'Stefano Ghisoni' }]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/organizations');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('lancia in errore su risposta non ok', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(listOrganizations('tok')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: FAIL (`listOrganizations` non esportata).

- [ ] **Step 3: Implementare**

In `app/lib/supabase-management.server.ts`, dopo l'interfaccia `SupabaseProjectKeys`:

```typescript
export interface SupabaseOrganization {
  id: string;
  name: string;
}
```

E in fondo al file:

```typescript
export async function listOrganizations(
  accessToken: string,
): Promise<SupabaseOrganization[]> {
  const res = await fetch(`${MGMT_BASE}/v1/organizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase organizations error: ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((o) => ({ id: String(o.id), name: String(o.name) }));
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add listOrganizations to Supabase management client"
```

---

### Task 4: Management — region (`SUPABASE_REGIONS` + `listRegions`)

**Files:**
- Modify: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Produces: `interface SupabaseRegion { id: string; name: string }`; costante `SUPABASE_REGIONS: SupabaseRegion[]` (lista ufficiale corrente); `listRegions(accessToken: string): Promise<SupabaseRegion[]>` — prova un endpoint dinamico e, in caso di errore, ritorna `SUPABASE_REGIONS`.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
describe('listRegions', () => {
  it('ritorna la lista di fallback se l’endpoint dinamico fallisce', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    const regions = await listRegions('tok');
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((r) => typeof r.id === 'string' && typeof r.name === 'string')).toBe(true);
    // deve contenere una region UE di default
    expect(regions.some((r) => r.id === 'eu-central-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: FAIL (`listRegions` non esportata).

- [ ] **Step 3: Implementare**

In `app/lib/supabase-management.server.ts`:

```typescript
export interface SupabaseRegion {
  id: string;
  name: string;
}

// Lista ufficiale corrente (fallback). Ordine con UE in cima come default sensato.
export const SUPABASE_REGIONS: SupabaseRegion[] = [
  { id: 'eu-central-1', name: 'Central EU (Frankfurt)' },
  { id: 'eu-west-1', name: 'West EU (Ireland)' },
  { id: 'eu-west-2', name: 'West EU (London)' },
  { id: 'eu-west-3', name: 'West EU (Paris)' },
  { id: 'us-east-1', name: 'East US (North Virginia)' },
  { id: 'us-west-1', name: 'West US (North California)' },
  { id: 'us-east-2', name: 'East US (Ohio)' },
  { id: 'ap-southeast-1', name: 'Southeast Asia (Singapore)' },
  { id: 'ap-northeast-1', name: 'Northeast Asia (Tokyo)' },
  { id: 'ap-south-1', name: 'South Asia (Mumbai)' },
  { id: 'sa-east-1', name: 'South America (São Paulo)' },
  { id: 'ca-central-1', name: 'Canada (Central)' },
];

// Tenta un endpoint dinamico; se non disponibile, usa la lista di fallback.
// NOTA IMPLEMENTAZIONE: verificare se la Management API espone un endpoint
// "available regions". Se sì, sostituire il path e il parsing qui; il fallback
// garantisce comunque il funzionamento.
export async function listRegions(accessToken: string): Promise<SupabaseRegion[]> {
  try {
    const res = await fetch(`${MGMT_BASE}/v1/projects/available-regions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return SUPABASE_REGIONS;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) return SUPABASE_REGIONS;
    return data.map((r) => ({ id: String(r.id ?? r.region), name: String(r.name ?? r.id) }));
  } catch {
    return SUPABASE_REGIONS;
  }
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add Supabase regions list with fallback"
```

---

### Task 5: Management — `createProject`

**Files:**
- Modify: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Produces: `interface SupabaseCreateProjectResult { ref: string }`; `createProject(accessToken: string, params: { name: string; organizationId: string; region: string; dbPass: string }): Promise<SupabaseCreateProjectResult>` — POST `/v1/projects`.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
describe('createProject', () => {
  it('POST /v1/projects con body corretto e ritorna il ref', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'newref123', name: 'My Project' }),
    });
    const res = await createProject('tok', {
      name: 'My Project',
      organizationId: 'org1',
      region: 'eu-central-1',
      dbPass: 'Secret-123',
    });
    expect(res).toEqual({ ref: 'newref123' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('My Project');
    expect(body.organization_id).toBe('org1');
    expect(body.region).toBe('eu-central-1');
    expect(body.db_pass).toBe('Secret-123');
  });

  it('lancia in errore su risposta non ok (incl. 403 scope insufficiente)', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      createProject('tok', { name: 'x', organizationId: 'o', region: 'eu-central-1', dbPass: 'p' }),
    ).rejects.toThrow('403');
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: FAIL (`createProject` non esportata).

- [ ] **Step 3: Implementare**

```typescript
export interface SupabaseCreateProjectResult {
  ref: string;
}

export async function createProject(
  accessToken: string,
  params: { name: string; organizationId: string; region: string; dbPass: string },
): Promise<SupabaseCreateProjectResult> {
  const res = await fetch(`${MGMT_BASE}/v1/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      organization_id: params.organizationId,
      region: params.region,
      db_pass: params.dbPass,
    }),
  });
  if (!res.ok) throw new Error(`Supabase create project error: ${res.status}`);
  const data = (await res.json()) as { id?: unknown; ref?: unknown };
  const ref = String(data.id ?? data.ref);
  return { ref };
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add createProject to Supabase management client"
```

---

### Task 6: Management — `getProject` (stato per il polling)

**Files:**
- Modify: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Produces: `getProject(accessToken: string, ref: string): Promise<{ status: string }>` — GET `/v1/projects/{ref}`.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
describe('getProject', () => {
  it('GET /v1/projects/{ref} e ritorna lo status', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'r1', status: 'ACTIVE_HEALTHY' }),
    });
    const res = await getProject('tok', 'r1');
    expect(res.status).toBe('ACTIVE_HEALTHY');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects/r1');
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare**

```typescript
export async function getProject(
  accessToken: string,
  ref: string,
): Promise<{ status: string }> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase get project error: ${res.status}`);
  const data = (await res.json()) as { status?: unknown };
  return { status: String(data.status ?? 'UNKNOWN') };
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add getProject status polling helper"
```

---

### Task 7: Management — `resetDbPassword`

**Files:**
- Modify: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Produces: `resetDbPassword(accessToken: string, ref: string, newPass: string): Promise<void>`. In caso di endpoint non disponibile (404/405) lancia `Error` con messaggio `unsupported` così la route può degradare.

> NOTA ESTERNA: l'endpoint esatto va confermato dalla doc Supabase corrente. Il codice qui punta a `PATCH /v1/projects/{ref}/config/database` (aggiornamento config DB). Se la doc indica un path diverso per il reset password, aggiornalo mantenendo la firma e la gestione errori.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
describe('resetDbPassword', () => {
  it('invia la nuova password al progetto e risolve su ok', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(resetDbPassword('tok', 'r1', 'NewPass-9')).resolves.toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('https://api.supabase.com/v1/projects/r1');
    expect(String(init.body)).toContain('NewPass-9');
  });

  it('segnala unsupported su 404', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(resetDbPassword('tok', 'r1', 'p')).rejects.toThrow('unsupported');
  });
});
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare**

```typescript
export async function resetDbPassword(
  accessToken: string,
  ref: string,
  newPass: string,
): Promise<void> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/config/database`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPass }),
  });
  if (res.status === 404 || res.status === 405) {
    throw new Error('unsupported: reset db password non disponibile');
  }
  if (!res.ok) throw new Error(`Supabase reset password error: ${res.status}`);
}
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `npm test -- --run app/lib/supabase-management.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add resetDbPassword with unsupported-endpoint handling"
```

---

### Task 8: Route `GET /api/supabase/regions`

**Files:**
- Create: `app/routes/api.supabase.regions.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `getValidAccessToken` (esistente), `listRegions` (Task 4).
- Produces: `GET` → `{ regions: SupabaseRegion[] }`. Usata dal componente Task 14.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.regions.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listRegions, SUPABASE_REGIONS } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop non trovato', { status: 404 });

  try {
    const token = await getValidAccessToken(shop.id);
    const regions = await listRegions(token);
    return json({ regions });
  } catch (e) {
    console.error('[api.supabase.regions]', e instanceof Error ? e.message : 'errore sconosciuto');
    // Fallback: restituisci comunque la lista statica per non bloccare il form.
    return json({ regions: SUPABASE_REGIONS });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.regions.tsx
git commit -m "feat: add Supabase regions endpoint"
```

---

### Task 9: Route `POST /api/supabase/create-project`

**Files:**
- Create: `app/routes/api.supabase.create-project.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `encrypt`, `getValidAccessToken`, `listOrganizations` (Task 3), `createProject` (Task 5), `generateDbPassword` (Task 2).
- Produces: `POST` body `{ name: string; region: string }` → `{ ok: true, ref: string, password: string }` | `{ ok: false, error, code? }`. `password` è mostrata una volta al client. Salva `supabaseProjectRef` e `supabaseDbPassword` (cifrata).

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.create-project.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listOrganizations, createProject } from '~/lib/supabase-management.server';
import { generateDbPassword } from '~/lib/password.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });

  const body = (await request.json()) as { name?: unknown; region?: unknown };
  if (!body.name || typeof body.name !== 'string' || !body.region || typeof body.region !== 'string') {
    return json({ ok: false, error: 'Nome e region sono obbligatori' }, { status: 400 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const orgs = await listOrganizations(token);
    if (orgs.length === 0) {
      return json({ ok: false, error: 'Nessuna organizzazione Supabase trovata' }, { status: 400 });
    }
    const dbPass = generateDbPassword();
    const { ref } = await createProject(token, {
      name: body.name,
      organizationId: orgs[0].id,
      region: body.region,
      dbPass,
    });

    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: `https://${ref}.supabase.co`,
        supabasePublicKey: '',
        supabaseServiceRoleKey: '',
        supabaseProjectRef: ref,
        supabaseDbPassword: encrypt(dbPass),
      },
      update: {
        supabaseProjectRef: ref,
        supabaseDbPassword: encrypt(dbPass),
      },
    });

    return json({ ok: true, ref, password: dbPass });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore sconosciuto';
    console.error('[api.supabase.create-project]', msg);
    // 403 = scope Projects:Write mancante nella OAuth App.
    if (msg.includes('403')) {
      return json(
        { ok: false, error: 'Permesso insufficiente per creare progetti. Ricollega Supabase.', code: 'scope' },
        { status: 403 },
      );
    }
    return json({ ok: false, error: 'Creazione del progetto non riuscita. Riprova.' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.create-project.tsx
git commit -m "feat: add create-project endpoint (async provisioning start)"
```

---

### Task 10: Route `GET /api/supabase/project-status`

**Files:**
- Create: `app/routes/api.supabase.project-status.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `getValidAccessToken`, `getProject` (Task 6).
- Produces: `GET` `?ref=<ref>` → `{ status: string, ready: boolean }`. `ready` è `true` quando `status === 'ACTIVE_HEALTHY'`.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.project-status.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { getProject } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop non trovato', { status: 404 });

  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return json({ status: 'UNKNOWN', ready: false }, { status: 400 });

  try {
    const token = await getValidAccessToken(shop.id);
    const { status } = await getProject(token, ref);
    return json({ status, ready: status === 'ACTIVE_HEALTHY' });
  } catch (e) {
    console.error('[api.supabase.project-status]', e instanceof Error ? e.message : 'errore sconosciuto');
    return json({ status: 'ERROR', ready: false }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.project-status.tsx
git commit -m "feat: add project-status polling endpoint"
```

---

### Task 11: Route `POST /api/supabase/regenerate-password`

**Files:**
- Create: `app/routes/api.supabase.regenerate-password.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `encrypt`, `getValidAccessToken`, `resetDbPassword` (Task 7), `generateDbPassword` (Task 2).
- Produces: `POST` → `{ ok: true, password: string }` | `{ ok: false, error, code? }`. Legge `supabaseProjectRef` dalla config; genera nuova password; reset su Supabase; aggiorna copia cifrata.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.regenerate-password.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { resetDbPassword } from '~/lib/supabase-management.server';
import { generateDbPassword } from '~/lib/password.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });

  const config = await prisma.supabaseConfig.findUnique({ where: { shopId: shop.id } });
  if (!config?.supabaseProjectRef) {
    return json({ ok: false, error: 'Nessun progetto collegato' }, { status: 400 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const newPass = generateDbPassword();
    await resetDbPassword(token, config.supabaseProjectRef, newPass);
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { supabaseDbPassword: encrypt(newPass) },
    });
    return json({ ok: true, password: newPass });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore sconosciuto';
    console.error('[api.supabase.regenerate-password]', msg);
    if (msg.startsWith('unsupported')) {
      return json(
        { ok: false, error: 'La rigenerazione automatica non è disponibile per questo progetto. Cambiala dalla dashboard Supabase.', code: 'unsupported' },
        { status: 501 },
      );
    }
    return json({ ok: false, error: 'Rigenerazione password non riuscita. Riprova.' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.regenerate-password.tsx
git commit -m "feat: add regenerate-password endpoint with graceful degrade"
```

---

### Task 12: Route `POST /api/supabase/disconnect`

**Files:**
- Create: `app/routes/api.supabase.disconnect.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`.
- Produces: `POST` → `{ ok: true }`. Cancella `supabaseOAuthToken` e `supabaseConfig` dello shop (non distruttivo lato Supabase). Idempotente.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.disconnect.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });

  // deleteMany è idempotente: non fallisce se le righe non esistono.
  await prisma.supabaseOAuthToken.deleteMany({ where: { shopId: shop.id } });
  await prisma.supabaseConfig.deleteMany({ where: { shopId: shop.id } });

  return json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.disconnect.tsx
git commit -m "feat: add non-destructive Supabase disconnect endpoint"
```

---

### Task 13: `SupabaseConnect` — dropdown Polaris, spinner interno, disconnetti

**Files:**
- Modify: `app/components/Dashboard/SupabaseConnect.tsx`
- Modify: `app/routes/_index.tsx` (passa lo stato `connected` al componente)

**Interfaces:**
- Consumes: endpoint `POST /api/supabase/oauth-url`, `GET /api/supabase/projects`, `POST /api/supabase/select-project`, `POST /api/supabase/disconnect` (Task 12).
- Produces: componente `SupabaseConnect` con prop `{ connected: boolean; projectName?: string; projectUrl?: string }`. Sostituisce il `Select` nativo con `Combobox`+`Listbox` a metà larghezza; spinner dentro al pulsante; stato "collegato" con "Disconnetti".

- [ ] **Step 1: Riscrivere il componente (parte connessione + selezione + disconnetti)**

Sostituisci l'intero contenuto di `app/components/Dashboard/SupabaseConnect.tsx` con:

```tsx
// app/components/Dashboard/SupabaseConnect.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  BlockStack,
  InlineStack,
  Box,
  Button,
  Text,
  Banner,
  Combobox,
  Listbox,
  Icon,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

interface SupabaseConnectProps {
  connected: boolean;
  projectName?: string;
  projectUrl?: string;
}

export function SupabaseConnect({ connected, projectName, projectUrl }: SupabaseConnectProps) {
  const revalidator = useRevalidator();
  const urlFetcher = useFetcher<{ url?: string; error?: string }>();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const disconnectFetcher = useFetcher<{ ok?: boolean }>();

  const [connecting, setConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>('');
  const [query, setQuery] = useState('');
  const [popupRef, setPopupRef] = useState<Window | null>(null);

  // Ricezione esito OAuth dal popup (origine validata).
  useEffect(() => {
    const appOrigin = window.location.origin;
    function onMessage(event: MessageEvent) {
      if (event.origin !== appOrigin) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string };
      if (!data || data.type !== 'supabase-oauth') return;
      setConnecting(false);
      setPopupRef(null);
      if (data.ok) {
        setOauthError(null);
        projectsFetcher.load('/api/supabase/projects');
      } else {
        setOauthError('Collegamento a Supabase non riuscito. Riprova.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reindirizza il popup quando l'URL di authorize è pronto.
  useEffect(() => {
    if (urlFetcher.data?.url && popupRef) {
      popupRef.location.href = urlFetcher.data.url;
    } else if (urlFetcher.data?.error && popupRef) {
      popupRef.close();
      setPopupRef(null);
      setConnecting(false);
      setOauthError(urlFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFetcher.data]);

  const startConnect = useCallback(() => {
    setOauthError(null);
    const popup = window.open('', 'supabase-oauth', 'width=600,height=760');
    if (!popup) {
      setOauthError('Consenti i popup per collegare Supabase.');
      return;
    }
    setPopupRef(popup);
    setConnecting(true);
    urlFetcher.submit(null, { method: 'post', action: '/api/supabase/oauth-url' });
  }, [urlFetcher]);

  const confirmSelection = useCallback(() => {
    selectFetcher.submit(
      { ref: selectedRef },
      { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
    );
  }, [selectFetcher, selectedRef]);

  const disconnect = useCallback(() => {
    disconnectFetcher.submit(null, { method: 'post', action: '/api/supabase/disconnect' });
  }, [disconnectFetcher]);

  // Al successo di selezione o disconnessione, ricarica il loader.
  useEffect(() => {
    if (selectFetcher.data?.ok || disconnectFetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data, disconnectFetcher.data]);

  const projects = projectsFetcher.data?.projects;
  const projectsLoaded = projectsFetcher.state === 'idle' && projects !== undefined;

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  const selectedName = projects?.find((p) => p.id === selectedRef)?.name ?? '';

  // STATO: collegato
  if (connected) {
    return (
      <BlockStack gap="300">
        <Banner tone="success">
          Supabase collegato{projectName ? ` — progetto ${projectName}` : ''}.
        </Banner>
        {projectUrl && (
          <Text as="p" tone="subdued">
            URL: <code>{projectUrl}</code>
          </Text>
        )}
        <InlineStack gap="200">
          <Button variant="primary" disabled>
            Collega Supabase
          </Button>
          <Button
            tone="critical"
            onClick={disconnect}
            loading={disconnectFetcher.state !== 'idle'}
          >
            Disconnetti
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Verrai portato su Supabase per accedere o creare gratuitamente un account, poi torni
        qui. L'app elencherà i tuoi progetti e configurerà le tabelle nel progetto scelto.
      </Text>

      {oauthError && <Banner tone="critical">{oauthError}</Banner>}

      {!projectsLoaded && (
        <InlineStack>
          <Button variant="primary" onClick={startConnect} loading={connecting}>
            Collega Supabase
          </Button>
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          Nessun progetto trovato nel tuo account Supabase. Puoi crearne uno qui sotto.
        </Banner>
      )}

      {projectsLoaded && projects && projects.length > 0 && (
        <Box maxWidth="50%">
          <Combobox
            activator={
              <Combobox.TextField
                prefix={<Icon source={SearchIcon} />}
                onChange={setQuery}
                label="Progetto Supabase"
                value={selectedName || query}
                placeholder="Seleziona un progetto…"
                autoComplete="off"
              />
            }
          >
            {filtered.length > 0 ? (
              <Listbox
                onSelect={(value) => {
                  setSelectedRef(value);
                  setQuery('');
                }}
              >
                {filtered.map((p) => (
                  <Listbox.Option key={p.id} value={p.id} selected={p.id === selectedRef}>
                    {p.name}
                  </Listbox.Option>
                ))}
              </Listbox>
            ) : null}
          </Combobox>
        </Box>
      )}

      {selectedRef && (
        <BlockStack gap="200">
          <Text as="p" tone="subdued">
            Progetto: <strong>{selectedName}</strong> — URL:{' '}
            <code>https://{selectedRef}.supabase.co</code>. Confermando, l'app salverà le chiavi
            e creerà le tabelle <code>products</code>/<code>customers</code>.
          </Text>
          {selectFetcher.data?.error && <Banner tone="critical">{selectFetcher.data.error}</Banner>}
          <InlineStack>
            <Button
              variant="primary"
              onClick={confirmSelection}
              loading={selectFetcher.state !== 'idle'}
            >
              Conferma e crea tabelle
            </Button>
          </InlineStack>
        </BlockStack>
      )}
    </BlockStack>
  );
}
```

- [ ] **Step 2: Passare `connected`/nome/URL dal loader in `_index.tsx`**

In `app/routes/_index.tsx`, dove viene renderizzato `<SupabaseConnect />` (contenuto dello step `connect-supabase`), sostituisci con:

```tsx
      content: (
        <SupabaseConnect
          connected={supabaseConnected}
          projectName={shop.supabaseConfig?.supabaseProjectRef ?? undefined}
          projectUrl={shop.supabaseConfig?.supabaseUrl ?? undefined}
        />
      ),
```

(`supabaseConnected` e `shop.supabaseConfig` sono già disponibili nel loader esistente.)

- [ ] **Step 3: Typecheck e suite**

Run: `npm run typecheck && npm test -- --run`
Expected: nessun errore; tutti i test passano.

- [ ] **Step 4: Commit**

```bash
git add app/components/Dashboard/SupabaseConnect.tsx app/routes/_index.tsx
git commit -m "feat: Polaris combobox, in-button spinner, disconnect in SupabaseConnect"
```

---

### Task 14: `SupabaseConnect` — form "Crea nuovo progetto" + polling

**Files:**
- Modify: `app/components/Dashboard/SupabaseConnect.tsx`

**Interfaces:**
- Consumes: `GET /api/supabase/regions` (Task 8), `POST /api/supabase/create-project` (Task 9), `GET /api/supabase/project-status` (Task 10), `POST /api/supabase/regenerate-password` (Task 11), `POST /api/supabase/select-project`.
- Produces: sezione "Crea nuovo progetto" nel componente, attivata da un pulsante/voce, con form (nome, region `Select` Polaris, password auto-generata + copia + rigenera) e polling fino a `ready` → `select-project` → `revalidate()`.

- [ ] **Step 1: Aggiungere lo stato e gli import per la creazione**

In cima al file aggiungi agli import di Polaris: `Select`, `TextField`, `Spinner`. Dentro il componente, dopo gli stati esistenti, aggiungi:

```tsx
  const regionsFetcher = useFetcher<{ regions: { id: string; name: string }[] }>();
  const createFetcher = useFetcher<{ ok?: boolean; ref?: string; password?: string; error?: string }>();
  const regenFetcher = useFetcher<{ ok?: boolean; password?: string; error?: string }>();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [region, setRegion] = useState('eu-central-1');
  const [genPassword, setGenPassword] = useState('');
  const [creatingRef, setCreatingRef] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Carica le region quando si apre il form.
  useEffect(() => {
    if (showCreate && regionsFetcher.state === 'idle' && !regionsFetcher.data) {
      regionsFetcher.load('/api/supabase/regions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  // Quando la creazione ritorna il ref, mostra la password e avvia il polling.
  useEffect(() => {
    if (createFetcher.data?.ok && createFetcher.data.ref) {
      setGenPassword(createFetcher.data.password ?? '');
      setCreatingRef(createFetcher.data.ref);
      setProvisioning(true);
      setCreateError(null);
    } else if (createFetcher.data && createFetcher.data.ok === false) {
      setCreateError(createFetcher.data.error ?? 'Creazione non riuscita.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.data]);

  // Aggiorna la password mostrata dopo un "Rigenera".
  useEffect(() => {
    if (regenFetcher.data?.ok && regenFetcher.data.password) {
      setGenPassword(regenFetcher.data.password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenFetcher.data]);

  // Polling dello stato del progetto finché è pronto, poi select-project.
  useEffect(() => {
    if (!provisioning || !creatingRef) return;
    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - started > 3 * 60 * 1000) {
        clearInterval(timer);
        setProvisioning(false);
        setCreateError('Il provisioning ci sta mettendo più del previsto. Riprova tra poco.');
        return;
      }
      try {
        const res = await fetch(`/api/supabase/project-status?ref=${encodeURIComponent(creatingRef)}`);
        const data = (await res.json()) as { ready?: boolean };
        if (data.ready && !cancelled) {
          clearInterval(timer);
          setProvisioning(false);
          selectFetcher.submit(
            { ref: creatingRef },
            { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
          );
        }
      } catch {
        // rete transitoria: riprova al tick successivo
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioning, creatingRef]);

  const submitCreate = useCallback(() => {
    setCreateError(null);
    createFetcher.submit(
      { name: newName, region },
      { method: 'post', action: '/api/supabase/create-project', encType: 'application/json' },
    );
  }, [createFetcher, newName, region]);

  const regenerate = useCallback(() => {
    regenFetcher.submit(null, { method: 'post', action: '/api/supabase/regenerate-password' });
  }, [regenFetcher]);
```

- [ ] **Step 2: Aggiungere l'UI del form nel ramo "connesso, nessun progetto"**

Dentro il blocco `projectsLoaded && projects && ...`, sotto il `Combobox`/empty-state, aggiungi un pulsante per aprire il form e il form stesso:

```tsx
      {projectsLoaded && projects && !showCreate && (
        <InlineStack>
          <Button onClick={() => setShowCreate(true)}>➕ Crea nuovo progetto</Button>
        </InlineStack>
      )}

      {showCreate && (
        <Box maxWidth="50%">
          <BlockStack gap="300">
            <TextField
              label="Nome del nuovo progetto"
              value={newName}
              onChange={setNewName}
              autoComplete="off"
            />
            <Select
              label="Region"
              options={(regionsFetcher.data?.regions ?? [{ id: 'eu-central-1', name: 'Central EU (Frankfurt)' }]).map(
                (r) => ({ label: r.name, value: r.id }),
              )}
              value={region}
              onChange={setRegion}
            />
            {genPassword && (
              <BlockStack gap="100">
                <Text as="p" tone="subdued">
                  Password del database (salvata in modo sicuro, copiala ora):
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  <code>{genPassword}</code>
                  <Button onClick={() => navigator.clipboard?.writeText(genPassword)}>Copia</Button>
                  <Button
                    onClick={regenerate}
                    loading={regenFetcher.state !== 'idle'}
                    disabled={!creatingRef}
                  >
                    Rigenera password
                  </Button>
                </InlineStack>
                {regenFetcher.data?.error && (
                  <Banner tone="warning">{regenFetcher.data.error}</Banner>
                )}
              </BlockStack>
            )}
            {createError && <Banner tone="critical">{createError}</Banner>}
            {provisioning ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner accessibilityLabel="Creazione in corso" size="small" />
                <Text as="span">Creazione del progetto in corso… (può richiedere 1-2 minuti)</Text>
              </InlineStack>
            ) : (
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={submitCreate}
                  loading={createFetcher.state !== 'idle'}
                  disabled={!newName}
                >
                  Crea progetto
                </Button>
                <Button onClick={() => setShowCreate(false)}>Annulla</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      )}
```

- [ ] **Step 3: Typecheck e suite**

Run: `npm run typecheck && npm test -- --run`
Expected: nessun errore; tutti i test passano.

- [ ] **Step 4: Verifica manuale (dev)**

Con `npm run dev` e le env OAuth impostate: apri lo Step 1 → "Collega Supabase" (spinner dentro al pulsante) → consenso → dropdown Polaris a metà larghezza → "➕ Crea nuovo progetto" → inserisci nome, scegli region, vedi password + Copia + Rigenera → "Crea progetto" → stato "Creazione in corso…" con polling → a progetto pronto lo Step 1 diventa "Completato". Verifica anche "Disconnetti" nello stato collegato.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/SupabaseConnect.tsx
git commit -m "feat: create-project form with region, password, provisioning polling"
```

---

## Self-Review

**Spec coverage:**
- §2 stati componente → Task 13 (non connesso/selezione/collegato) + Task 14 (form creazione).
- §3 flusso creazione (nome/region/password auto/polling→select-project) → Task 9/10/14; password gen → Task 2.
- §4 funzioni Management (listOrganizations/listRegions/createProject/getProject/resetDbPassword) → Task 3/4/5/6/7.
- §5 rigenera password (reset Supabase + copia cifrata + degrade) → Task 7 + Task 11.
- §6 disconnetti non distruttivo → Task 12 + Task 13 (UI).
- §7 modello dati (2 colonne nullable) → Task 1.
- §8 route → Task 8/9/10/11/12.
- §9 sicurezza (cifratura, log sanitizzati, 403 scope) → Global Constraints + Task 9 (gestione 403).
- §10 errori (limite free, timeout provisioning, reset non supportato) → Task 5 (403), Task 14 (timeout), Task 7/11 (unsupported).
- §11 test → Task 2/3/4/5/6/7 (unit); componente/route typecheck+manuale.
- §12 prerequisiti (scope Projects:Write, migrazione) → Global Constraints + Task 1.

**Type consistency:** `SupabaseOrganization`/`SupabaseRegion`/`SupabaseCreateProjectResult` (Task 3/4/5) usati in route Task 8/9; `createProject` firma `(token, {name, organizationId, region, dbPass})` coerente tra Task 5 e Task 9; `getProject` → `{status}` coerente tra Task 6 e Task 10; `generateDbPassword` (Task 2) usata in Task 9/11; risposta `{ ok, ref, password }` di Task 9 consumata in Task 14; `{ ready }` di Task 10 consumata nel polling Task 14; prop `SupabaseConnect { connected, projectName?, projectUrl? }` (Task 13) passata dal loader in Task 13 Step 2.

**Placeholder scan:** nessun TODO/TBD; ogni step con codice mostra il codice completo. Le note "verificare endpoint contro doc Supabase" (Task 4 listRegions, Task 7 resetDbPassword) sono caveat su contratti API esterni, con fallback/gestione errori concreti già codificati — non buchi del piano.

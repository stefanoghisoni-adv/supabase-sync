# Supabase OAuth + Management API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare Supabase allo Step 1 via OAuth in popup, elencare i progetti dell'account in un dropdown Polaris e — su conferma — recuperare chiavi/URL e creare le tabelle automaticamente.

**Architecture:** Un client Management API isolato (`supabase-management.server.ts`) incapsula tutte le chiamate HTTP a `api.supabase.com`; un modulo `supabase-oauth.server.ts` gestisce lo `state` CSRF firmato e i token per shop (cifrati, con refresh); quattro route Remix orchestrano il flusso (URL autorizzazione, callback, lista progetti, selezione); il contenuto dello Step 1 in `_index.tsx` è estratto in un componente `SupabaseConnect`.

**Tech Stack:** Remix, TypeScript, Shopify Polaris, Prisma, Vitest, Supabase Management API.

## Global Constraints

- App embedded Shopify (Remix + Polaris + Prisma) su Vercel Free; nessuna nuova infra a pagamento.
- **Env var nuove (l'owner le imposta su Vercel):** `SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET`. Redirect URI e origine `postMessage` derivano da `SHOPIFY_APP_URL`: `${SHOPIFY_APP_URL}/auth/supabase/callback`.
- **Management API base:** `https://api.supabase.com`. Endpoint: `GET /v1/oauth/authorize`, `POST /v1/oauth/token` (Basic auth `client_id:client_secret`, body form-urlencoded), `GET /v1/projects`, `GET /v1/projects/{ref}/api-keys?reveal=true`, `POST /v1/projects/{ref}/database/query`. URL progetto = `https://{ref}.supabase.co`.
- **Cifratura:** token OAuth e chiavi Supabase cifrati con `encrypt()`/`decrypt()` (`~/utils/crypto.server`, AES-256-GCM, `ENCRYPTION_SECRET`). Mai in log, mai al client.
- **State CSRF:** firmato HMAC-SHA256 con `ENCRYPTION_SECRET`, TTL 10 minuti, confronto **timing-safe**.
- **Creazione tabelle** via `POST /v1/projects/{ref}/database/query` (NON l'RPC `exec_sql`), riusando lo stesso DDL di `api.supabase.create-tables.tsx`.
- **Popup:** aperto **sincronicamente** nel click handler (`window.open('', ...)`) e poi reindirizzato all'URL, per non farlo bloccare dal popup-blocker. Origine `postMessage` validata su entrambi i lati.
- **Scope v1:** nessuna creazione di nuovo progetto; se l'account non ha progetti → stato vuoto con link alla dashboard Supabase.
- **UI:** pulsanti mai full-width; testi in italiano.
- **Test:** vitest; nessun `@testing-library/react` → i componenti si verificano con `npm run typecheck` + prova manuale; i test coprono logica pura / con `fetch` mockato.

**Deviazione dalla spec (voluta):** la spec §4 elencava `auth.supabase.start.tsx` (302 verso authorize). Il piano realizza lo stesso intento in modo più sicuro con `POST /api/supabase/oauth-url` (autenticato Shopify) che genera lo `state` firmato e restituisce l'URL; il client apre direttamente l'authorize. Un popup non ha la sessione Shopify, quindi lo `state` va generato in contesto autenticato.

---

### Task OAUTH-1: Tabella `supabase_oauth_tokens`

**Files:**
- Modify: `prisma/schema.prisma` (nuovo model + relazione su `Shop`)
- Create: migrazione in `prisma/migrations/`

**Interfaces:**
- Produces: model Prisma `SupabaseOAuthToken` (tabella `supabase_oauth_tokens`), 1:1 con `shops`. Usato da OAUTH-3, 5, 6, 7.

- [ ] **Step 1: Aggiungere il model e la relazione**

In `prisma/schema.prisma`, aggiungere il model:

```prisma
model SupabaseOAuthToken {
  id           String   @id @default(uuid())
  shopId       String   @unique @map("shop_id")
  accessToken  String   @map("access_token")
  refreshToken String   @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@map("supabase_oauth_tokens")
}
```

Nel model `Shop`, subito dopo la riga `supabaseConfig    SupabaseConfig?`, aggiungere:

```prisma
  supabaseOAuthToken SupabaseOAuthToken?
```

- [ ] **Step 2: Validare**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Creare la migrazione e generare il client**

Run: `npx prisma migrate dev --name add_supabase_oauth_tokens`
Se il DB di sviluppo non è raggiungibile:
Run: `npx prisma migrate dev --name add_supabase_oauth_tokens --create-only && npx prisma generate`

Contenuto atteso della migrazione:

```sql
CREATE TABLE "supabase_oauth_tokens" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supabase_oauth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supabase_oauth_tokens_shop_id_key" ON "supabase_oauth_tokens"("shop_id");

ALTER TABLE "supabase_oauth_tokens" ADD CONSTRAINT "supabase_oauth_tokens_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> Nota produzione: eseguire lo stesso DDL nel SQL Editor del Supabase metadata prima del deploy.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add supabase_oauth_tokens table"
```

---

### Task OAUTH-2: Client Management API

**Files:**
- Create: `app/lib/supabase-management.server.ts`
- Test: `app/lib/supabase-management.test.ts`

**Interfaces:**
- Produces:
  - `interface SupabaseTokenResponse { access_token: string; refresh_token: string; expires_in: number; token_type: string }`
  - `interface SupabaseProject { id: string; name: string; organization_id: string; region: string }`
  - `interface SupabaseProjectKeys { anon: string; serviceRole: string }`
  - `buildAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string }): string`
  - `exchangeCode(params: { code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<SupabaseTokenResponse>`
  - `refreshAccessToken(params: { refreshToken: string; clientId: string; clientSecret: string }): Promise<SupabaseTokenResponse>`
  - `listProjects(accessToken: string): Promise<SupabaseProject[]>`
  - `getProjectApiKeys(accessToken: string, ref: string): Promise<SupabaseProjectKeys>`
  - `runQuery(accessToken: string, ref: string, query: string): Promise<void>`
  - `projectUrl(ref: string): string`
  - Usati da OAUTH-3, 4, 5, 6, 7.

- [ ] **Step 1: Scrivere i test che falliscono**

```typescript
// app/lib/supabase-management.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCode,
  listProjects,
  getProjectApiKeys,
  projectUrl,
} from './supabase-management.server';

global.fetch = vi.fn();

describe('buildAuthorizeUrl', () => {
  it('builds the authorize URL with required params', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://app/cb', state: 'st' })
    );
    expect(url.origin + url.pathname).toBe('https://api.supabase.com/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('st');
  });
});

describe('exchangeCode', () => {
  it('POSTs form body with Basic auth and parses the token response', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'Bearer' }),
    });
    const res = await exchangeCode({ code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app/cb' });
    expect(res.access_token).toBe('a');
    expect(res.refresh_token).toBe('r');
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.supabase.com/v1/oauth/token');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('cid:sec').toString('base64'));
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=c');
  });
});

describe('listProjects', () => {
  it('maps the raw projects to the trimmed shape', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'ref1', name: 'P1', organization_id: 'org1', region: 'eu-central-1', extra: 'x' },
      ],
    });
    const projects = await listProjects('tok');
    expect(projects).toEqual([{ id: 'ref1', name: 'P1', organization_id: 'org1', region: 'eu-central-1' }]);
  });
});

describe('getProjectApiKeys', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('extracts anon and service_role keys', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'anon', api_key: 'anon-key' },
        { name: 'service_role', api_key: 'service-key' },
      ],
    });
    const keys = await getProjectApiKeys('tok', 'ref1');
    expect(keys).toEqual({ anon: 'anon-key', serviceRole: 'service-key' });
  });

  it('throws when a required key is missing', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ name: 'anon', api_key: 'anon-key' }],
    });
    await expect(getProjectApiKeys('tok', 'ref1')).rejects.toThrow();
  });
});

describe('projectUrl', () => {
  it('derives the project URL from the ref', () => {
    expect(projectUrl('abcd')).toBe('https://abcd.supabase.co');
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npm test -- supabase-management --run`
Expected: FAIL — "Cannot find module './supabase-management.server'".

- [ ] **Step 3: Implementare il client**

```typescript
// app/lib/supabase-management.server.ts
const MGMT_BASE = 'https://api.supabase.com';

export interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

export interface SupabaseProjectKeys {
  anon: string;
  serviceRole: string;
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`${MGMT_BASE}/v1/oauth/authorize`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  return url.toString();
}

async function tokenRequest(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<SupabaseTokenResponse> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${MGMT_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Supabase token error: ${res.status}`);
  return (await res.json()) as SupabaseTokenResponse;
}

export function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<SupabaseTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  return tokenRequest(body, params.clientId, params.clientSecret);
}

export function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<SupabaseTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });
  return tokenRequest(body, params.clientId, params.clientSecret);
}

export async function listProjects(accessToken: string): Promise<SupabaseProject[]> {
  const res = await fetch(`${MGMT_BASE}/v1/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase list projects error: ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    organization_id: String(p.organization_id),
    region: String(p.region),
  }));
}

export async function getProjectApiKeys(
  accessToken: string,
  ref: string,
): Promise<SupabaseProjectKeys> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase api-keys error: ${res.status}`);
  const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  const serviceRole = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!anon || !serviceRole) {
    throw new Error('Supabase api-keys: anon o service_role mancante');
  }
  return { anon, serviceRole };
}

export async function runQuery(
  accessToken: string,
  ref: string,
  query: string,
): Promise<void> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Supabase query error: ${res.status}`);
}

export function projectUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `npm test -- supabase-management --run`
Expected: PASS (tutti i test del file).

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-management.server.ts app/lib/supabase-management.test.ts
git commit -m "feat: add Supabase Management API client"
```

---

### Task OAUTH-3: State firmato + storage/refresh token

**Files:**
- Create: `app/lib/supabase-oauth.server.ts`
- Test: `app/lib/supabase-oauth.test.ts`

**Interfaces:**
- Consumes: `refreshAccessToken` (OAUTH-2), `encrypt`/`decrypt` (`~/utils/crypto.server`), `prisma`.
- Produces:
  - `signState(shopId: string, now?: number): string`
  - `verifyState(state: string, now?: number): { shopId: string } | null`
  - `saveTokens(shopId: string, t: { access_token: string; refresh_token: string; expires_in: number }): Promise<void>`
  - `getValidAccessToken(shopId: string): Promise<string>`
  - Usati da OAUTH-4, 5, 6, 7.

- [ ] **Step 1: Scrivere i test che falliscono**

```typescript
// app/lib/supabase-oauth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signState, verifyState } from './supabase-oauth.server';

describe('signState / verifyState', () => {
  let original: string | undefined;
  beforeAll(() => {
    original = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ENCRYPTION_SECRET;
    else process.env.ENCRYPTION_SECRET = original;
  });

  it('round-trips the shopId', () => {
    const state = signState('shop-123');
    expect(verifyState(state)).toEqual({ shopId: 'shop-123' });
  });

  it('rejects a tampered state', () => {
    const state = signState('shop-123');
    const tampered = state.slice(0, -2) + (state.endsWith('a') ? 'bb' : 'aa');
    expect(verifyState(tampered)).toBeNull();
  });

  it('rejects an expired state', () => {
    const past = Date.now() - 60 * 60 * 1000; // 1h fa
    const state = signState('shop-123', past);
    expect(verifyState(state)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyState('not-a-valid-state')).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarne il fallimento**

Run: `npm test -- supabase-oauth --run`
Expected: FAIL — "Cannot find module './supabase-oauth.server'".

- [ ] **Step 3: Implementare il modulo**

```typescript
// app/lib/supabase-oauth.server.ts
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '~/db.server';
import { encrypt, decrypt } from '~/utils/crypto.server';
import { refreshAccessToken } from './supabase-management.server';

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error('ENCRYPTION_SECRET non configurato');
  return s;
}

export function signState(shopId: string, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ shopId, exp: now + STATE_TTL_MS }),
  ).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(
  state: string,
  now: number = Date.now(),
): { shopId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      shopId?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.shopId !== 'string' || typeof parsed.exp !== 'number') return null;
    if (now > parsed.exp) return null;
    return { shopId: parsed.shopId };
  } catch {
    return null;
  }
}

export async function saveTokens(
  shopId: string,
  t: { access_token: string; refresh_token: string; expires_in: number },
): Promise<void> {
  const expiresAt = new Date(Date.now() + t.expires_in * 1000);
  const data = {
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(t.refresh_token),
    expiresAt,
  };
  await prisma.supabaseOAuthToken.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
  });
}

export async function getValidAccessToken(shopId: string): Promise<string> {
  const row = await prisma.supabaseOAuthToken.findUnique({ where: { shopId } });
  if (!row) throw new Error('Supabase non collegato per questo shop');

  const skewMs = 60_000;
  if (row.expiresAt.getTime() - skewMs > Date.now()) {
    return decrypt(row.accessToken);
  }

  const refreshed = await refreshAccessToken({
    refreshToken: decrypt(row.refreshToken),
    clientId: process.env.SUPABASE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.SUPABASE_OAUTH_CLIENT_SECRET || '',
  });
  await saveTokens(shopId, refreshed);
  return refreshed.access_token;
}
```

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `npm test -- supabase-oauth --run`
Expected: PASS (4 test).

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: nessun errore.

```bash
git add app/lib/supabase-oauth.server.ts app/lib/supabase-oauth.test.ts
git commit -m "feat: add Supabase OAuth state signing and token storage"
```

---

### Task OAUTH-4: Route `POST /api/supabase/oauth-url`

**Files:**
- Create: `app/routes/api.supabase.oauth-url.tsx`

**Interfaces:**
- Consumes: `authenticate` (`~/shopify.server`), `prisma`, `signState` (OAUTH-3), `buildAuthorizeUrl` (OAUTH-2).
- Produces: `POST` → `{ url: string }` (authorize URL con state firmato). Usato dal componente OAUTH-8.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.oauth-url.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { signState } from '~/lib/supabase-oauth.server';
import { buildAuthorizeUrl } from '~/lib/supabase-management.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ error: 'Shop non trovato' }, { status: 404 });
  }

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!clientId || !appUrl) {
    return json({ error: 'Integrazione Supabase non configurata' }, { status: 500 });
  }

  const state = signState(shop.id);
  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: `${appUrl}/auth/supabase/callback`,
    state,
  });

  return json({ url });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.oauth-url.tsx
git commit -m "feat: add authenticated Supabase OAuth URL endpoint"
```

---

### Task OAUTH-5: Route `/auth/supabase/callback`

**Files:**
- Create: `app/routes/auth.supabase.callback.tsx`

**Interfaces:**
- Consumes: `verifyState`, `saveTokens` (OAUTH-3), `exchangeCode` (OAUTH-2).
- Produces: resource route (solo `loader`, nessun componente) che risponde HTML con `postMessage({ type: 'supabase-oauth', ok, error? })` + `window.close()`.

**Nota:** essendo un resource route (nessun default export), la Response HTML viene restituita così com'è, senza passare dal rendering documento e senza gli header CSP di Shopify — lo script inline gira. Non richiede autenticazione Shopify (lo shop è identificato dallo `state`).

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/auth.supabase.callback.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { verifyState, saveTokens } from '~/lib/supabase-oauth.server';
import { exchangeCode } from '~/lib/supabase-management.server';

function closePage(message: Record<string, unknown>, appOrigin: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
(function () {
  try {
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify(message)}, ${JSON.stringify(appOrigin)});
    }
  } catch (e) {}
  window.close();
})();
</script>
<p>Puoi chiudere questa finestra.</p>
</body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appOrigin = new URL(process.env.SHOPIFY_APP_URL || url.origin).origin;

  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error) {
    return closePage({ type: 'supabase-oauth', ok: false, error }, appOrigin);
  }
  if (!code || !state) {
    return closePage(
      { type: 'supabase-oauth', ok: false, error: 'missing_code_or_state' },
      appOrigin,
    );
  }

  const verified = verifyState(state);
  if (!verified) {
    return closePage({ type: 'supabase-oauth', ok: false, error: 'invalid_state' }, appOrigin);
  }

  try {
    const tokens = await exchangeCode({
      code,
      clientId: process.env.SUPABASE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.SUPABASE_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${appOrigin}/auth/supabase/callback`,
    });
    await saveTokens(verified.shopId, tokens);
    return closePage({ type: 'supabase-oauth', ok: true }, appOrigin);
  } catch (e) {
    console.error('[supabase callback] exchange fallito:', e);
    return closePage({ type: 'supabase-oauth', ok: false, error: 'exchange_failed' }, appOrigin);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Verifica manuale (rimandabile a OAUTH-8)**

Il flusso end-to-end si prova col componente in OAUTH-8. Qui basta il typecheck.

- [ ] **Step 4: Commit**

```bash
git add app/routes/auth.supabase.callback.tsx
git commit -m "feat: add Supabase OAuth callback route"
```

---

### Task OAUTH-6: Route `GET /api/supabase/projects`

**Files:**
- Create: `app/routes/api.supabase.projects.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `getValidAccessToken` (OAUTH-3), `listProjects` (OAUTH-2).
- Produces: `GET` → `{ projects: SupabaseProject[] }`. Usato dal componente OAUTH-8.

- [ ] **Step 1: Creare la route**

```tsx
// app/routes/api.supabase.projects.tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listProjects } from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    throw new Response('Shop non trovato', { status: 404 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const projects = await listProjects(token);
    return json({ projects });
  } catch (e) {
    console.error('[api.supabase.projects]', e);
    return json({ projects: [], error: 'Impossibile recuperare i progetti Supabase.' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.supabase.projects.tsx
git commit -m "feat: add Supabase projects list endpoint"
```

---

### Task OAUTH-7: DDL condiviso + route `POST /api/supabase/select-project`

**Files:**
- Create: `app/lib/supabase-schema.ts`
- Modify: `app/routes/api.supabase.create-tables.tsx` (riusa il DDL condiviso)
- Create: `app/routes/api.supabase.select-project.tsx`

**Interfaces:**
- Consumes: `authenticate`, `prisma`, `encrypt`, `getValidAccessToken` (OAUTH-3), `getProjectApiKeys`/`runQuery`/`projectUrl` (OAUTH-2).
- Produces:
  - `app/lib/supabase-schema.ts` esporta `PRODUCTS_TABLE_SQL`, `CUSTOMERS_TABLE_SQL`, `MERCHANT_TABLES_SQL` (= i due concatenati).
  - `POST /api/supabase/select-project` con body `{ ref: string }` → `{ ok: true }` | `{ ok: false, error }`.

- [ ] **Step 1: Estrarre il DDL in un modulo condiviso**

Creare `app/lib/supabase-schema.ts` copiando i due literal SQL **esattamente** come sono oggi in `app/routes/api.supabase.create-tables.tsx` (righe 8-77):

```typescript
// app/lib/supabase-schema.ts
export const PRODUCTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id BIGINT NOT NULL,
  shopify_variant_id BIGINT UNIQUE,
  is_variant BOOLEAN DEFAULT true,
  product_title TEXT NOT NULL,
  product_description TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  product_status TEXT,
  tags TEXT[],
  product_published_at TIMESTAMP,
  variant_title TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(10, 2) NOT NULL,
  compare_at_price NUMERIC(10, 2),
  cost_per_item NUMERIC(10, 2),
  position INTEGER,
  inventory_quantity INTEGER,
  weight NUMERIC(10, 3),
  weight_unit TEXT,
  requires_shipping BOOLEAN,
  taxable BOOLEAN,
  image_url TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_variant
  ON products(shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(product_status);
`;

export const CUSTOMERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  accepts_marketing BOOLEAN,
  marketing_opt_in_level TEXT,
  total_spent NUMERIC(10, 2),
  orders_count INTEGER,
  customer_state TEXT,
  tags TEXT[],
  note TEXT,
  verified_email BOOLEAN,
  tax_exempt BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
`;

export const MERCHANT_TABLES_SQL = PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL;
```

- [ ] **Step 2: Aggiornare `create-tables` per riusare il modulo**

In `app/routes/api.supabase.create-tables.tsx`: rimuovere le due costanti locali `PRODUCTS_TABLE_SQL` e `CUSTOMERS_TABLE_SQL` (righe 8-77) e importarle dal modulo condiviso. In testa al file aggiungere:

```tsx
import { PRODUCTS_TABLE_SQL, CUSTOMERS_TABLE_SQL } from '~/lib/supabase-schema';
```

Il resto del file resta invariato (`PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL` continua a funzionare).

- [ ] **Step 3: Creare la route `select-project`**

```tsx
// app/routes/api.supabase.select-project.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import {
  getProjectApiKeys,
  runQuery,
  projectUrl,
} from '~/lib/supabase-management.server';
import { MERCHANT_TABLES_SQL } from '~/lib/supabase-schema';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });
  }

  const body = (await request.json()) as { ref?: unknown };
  if (!body.ref || typeof body.ref !== 'string') {
    return json({ ok: false, error: 'ref del progetto mancante' }, { status: 400 });
  }
  const ref = body.ref;

  try {
    const token = await getValidAccessToken(shop.id);
    const keys = await getProjectApiKeys(token, ref);
    const url = projectUrl(ref);

    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
      },
      update: {
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
      },
    });

    await runQuery(token, ref, MERCHANT_TABLES_SQL);

    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: new Date() },
    });

    return json({ ok: true });
  } catch (e) {
    console.error('[api.supabase.select-project]', e);
    await prisma.supabaseConfig
      .update({ where: { shopId: shop.id }, data: { connectionVerifiedAt: null } })
      .catch(() => {});
    return json(
      { ok: false, error: 'Impossibile completare il collegamento. Riprova.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Typecheck e suite**

Run: `npm run typecheck`
Expected: nessun errore.
Run: `npm test -- --run`
Expected: PASS (nessuna regressione; `create-tables` continua a compilare col DDL importato).

- [ ] **Step 5: Commit**

```bash
git add app/lib/supabase-schema.ts app/routes/api.supabase.create-tables.tsx app/routes/api.supabase.select-project.tsx
git commit -m "feat: add select-project endpoint and share merchant DDL"
```

---

### Task OAUTH-8: UI Step 1 — componente `SupabaseConnect`

**Files:**
- Create: `app/components/Dashboard/SupabaseConnect.tsx`
- Modify: `app/routes/_index.tsx` (usa `SupabaseConnect` come contenuto dello Step 1)

**Interfaces:**
- Consumes: endpoint `POST /api/supabase/oauth-url` (OAUTH-4), `GET /api/supabase/projects` (OAUTH-6), `POST /api/supabase/select-project` (OAUTH-7); `SupabaseProject` (OAUTH-2, ri-dichiarato localmente come tipo di risposta).
- Produces: componente React `SupabaseConnect` renderizzato nello Step 1.

**Comportamenti chiave:** popup aperto **sincronicamente** nel click (per evitare il blocco), `postMessage` con **origine validata**, spinner + pulsante disabilitato durante il collegamento, `Select` Polaris dei progetti, stato vuoto con link, riepilogo + "Conferma e crea tabelle", `revalidate()` al successo per far avanzare lo stepper.

- [ ] **Step 1: Creare il componente**

```tsx
// app/components/Dashboard/SupabaseConnect.tsx
import { useCallback, useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  BlockStack,
  InlineStack,
  Button,
  Text,
  Select,
  Banner,
  Spinner,
} from '@shopify/polaris';

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

export function SupabaseConnect() {
  const revalidator = useRevalidator();
  const urlFetcher = useFetcher<{ url?: string; error?: string }>();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  const [connecting, setConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>('');
  // Riferimento al popup aperto sincronicamente (dichiarato prima degli effetti che lo usano).
  const [popupRef, setPopupRef] = useState<Window | null>(null);

  // 1) Ricezione dell'esito OAuth dal popup (origine validata).
  useEffect(() => {
    const appOrigin = window.location.origin;
    function onMessage(event: MessageEvent) {
      if (event.origin !== appOrigin) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string };
      if (!data || data.type !== 'supabase-oauth') return;
      setConnecting(false);
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

  // 2) Quando l'URL di authorize è pronto, reindirizza il popup già aperto.
  useEffect(() => {
    if (urlFetcher.data?.url && popupRef) {
      popupRef.location.href = urlFetcher.data.url;
    } else if (urlFetcher.data?.error && popupRef) {
      popupRef.close();
      setConnecting(false);
      setOauthError(urlFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFetcher.data]);

  const startConnect = useCallback(() => {
    setOauthError(null);
    // Apertura SINCRONA nel gesto utente per non farlo bloccare.
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

  // Al successo della selezione, ricarica il loader → lo stepper avanza.
  useEffect(() => {
    if (selectFetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data]);

  const projects = projectsFetcher.data?.projects;
  const projectsLoaded = projectsFetcher.state === 'idle' && projects !== undefined;

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Collega il tuo account Supabase: l'app elencherà i tuoi progetti e configurerà
        automaticamente le tabelle nel progetto scelto.
      </Text>

      {oauthError && <Banner tone="critical">{oauthError}</Banner>}

      {!projectsLoaded && (
        <InlineStack gap="200" blockAlign="center">
          <Button variant="primary" onClick={startConnect} disabled={connecting}>
            Collega Supabase
          </Button>
          {connecting && <Spinner accessibilityLabel="Collegamento in corso" size="small" />}
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          Nessun progetto trovato nel tuo account Supabase.{' '}
          <a href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer">
            Creane uno sulla dashboard Supabase
          </a>{' '}
          e poi ricollega.
        </Banner>
      )}

      {projectsLoaded && projects && projects.length > 0 && (
        <BlockStack gap="300">
          <Select
            label="Progetto Supabase"
            options={[
              { label: 'Seleziona un progetto…', value: '' },
              ...projects.map((p) => ({ label: p.name, value: p.id })),
            ]}
            value={selectedRef}
            onChange={setSelectedRef}
          />

          {selectedRef && (
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                Progetto: <strong>{projects.find((p) => p.id === selectedRef)?.name}</strong> —
                URL: <code>https://{selectedRef}.supabase.co</code>. Confermando, l'app salverà
                le chiavi e creerà le tabelle <code>products</code>/<code>customers</code>.
              </Text>
              {selectFetcher.data?.error && (
                <Banner tone="critical">{selectFetcher.data.error}</Banner>
              )}
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
      )}
    </BlockStack>
  );
}
```

- [ ] **Step 2: Usare `SupabaseConnect` nello Step 1 di `_index.tsx`**

In `app/routes/_index.tsx`: importare il componente e sostituire il `content` dello Step 1 (oggi un `BlockStack` con testo + `Button url="/settings/supabase"`) con `<SupabaseConnect />`.

Aggiungere l'import in testa:

```tsx
import { SupabaseConnect } from '~/components/Dashboard/SupabaseConnect';
```

Nell'array `stepperItems`, per lo step `id: 'connect-supabase'`, sostituire il blocco `content: ( ... )` con:

```tsx
      content: <SupabaseConnect />,
```

- [ ] **Step 3: Typecheck e suite**

Run: `npm run typecheck`
Expected: nessun errore. Rimuovere eventuali import ora inutilizzati in `_index.tsx` (es. se `Button`/`InlineStack` non servono più nello step 1; restano se usati altrove come nello step 2).
Run: `npm test -- --run`
Expected: PASS (nessuna regressione).

- [ ] **Step 4: Verifica manuale (dev)**

Con `npm run dev` e le env var OAuth impostate: click "Collega Supabase" → si apre il popup → dopo il consenso il popup si chiude → compare il `Select` dei progetti → selezione → "Conferma e crea tabelle" → al successo lo Step 1 diventa "Completato" e lo Step 2 si sblocca. Verificare anche: popup bloccato → banner; nessun progetto → banner con link.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/SupabaseConnect.tsx app/routes/_index.tsx
git commit -m "feat: OAuth-based Supabase connect flow in step 1"
```

---

## Self-Review

**Spec coverage:**
- §1 scope v1 (collegamento + selezione esistenti) → OAUTH-4/5/6/7/8; creazione progetto esplicitamente fuori scope.
- §2 flusso utente (spinner/disabled, popup, dropdown, riepilogo+conferma, empty state) → OAUTH-8; token exchange → OAUTH-5; recupero chiavi+tabelle+`connectionVerifiedAt` → OAUTH-7.
- §3 Management API endpoints → OAUTH-2; creazione tabelle via `database/query` → OAUTH-7.
- §4 componenti/file → OAUTH-1 (tabella token), OAUTH-2 (management client), OAUTH-3 (oauth server), route → OAUTH-4/5/6/7, UI → OAUTH-8. (`auth.supabase.start` sostituito da `api.supabase.oauth-url` — deviazione documentata nei Global Constraints.)
- §5 sicurezza (state firmato timing-safe, token cifrati, postMessage con origine, service_role mai al client, client_secret solo server) → OAUTH-3 (state), OAUTH-2/7 (cifratura via encrypt), OAUTH-5/8 (postMessage origine).
- §6 errori (popup bloccato, consenso negato, state invalido, token scaduto→refresh, API 4xx/5xx, nessun progetto, DDL fallito) → OAUTH-8 (UI), OAUTH-3 (refresh), OAUTH-5/6/7 (server).
- §7 test → OAUTH-2 (client, fetch mockato), OAUTH-3 (state), altri via typecheck+manuale (assenza RTL nei Global Constraints).
- §8 prerequisiti rollout (OAuth app, env var, migrazione prod, incident chiuso) → Global Constraints + OAUTH-1 nota produzione; incident già chiuso fuori da questo piano.

**Placeholder scan:** nessun "TBD/TODO"; ogni step con codice mostra il codice completo. Le note "verificare gli shape contro i doc Supabase" (spec §3) sono un caveat operativo isolato nel client OAUTH-2, non un buco del piano.

**Type consistency:** `SupabaseTokenResponse`/`SupabaseProject`/`SupabaseProjectKeys` (OAUTH-2) usati coerentemente in OAUTH-3/5/6/7; `signState`/`verifyState`/`saveTokens`/`getValidAccessToken` (OAUTH-3) usati in OAUTH-4/5/6/7; `MERCHANT_TABLES_SQL` (OAUTH-7) usato in select-project; risposta `{ url }` di OAUTH-4, `{ projects }` di OAUTH-6, `{ ok }` di OAUTH-7 combaciano con i fetcher del componente OAUTH-8.

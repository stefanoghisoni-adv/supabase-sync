# Proxy di lettura con enforcement stato shop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esporre un endpoint proxy Supabase-compatibile che consente le letture dei dati sincronizzati solo se lo shop è `ENABLED` nel DB owner, inoltrando alla Supabase del merchant con la service_role.

**Architecture:** Il tracciamento (Stape/GTM) legge da `https://<app>/rest/v1/<table>` con un token-proxy per-shop nell'header `Authorization`/`apikey`. Una resource route Remix risolve il token → shop (cache 30s), verifica lo stato, valida la tabella per piano e inoltra a `<ref>.supabase.co` con la service_role. La RLS del merchant resta chiusa: il proxy è il solo percorso di lettura.

**Tech Stack:** Remix 2 (resource route/loader), Prisma (DB owner), Node `crypto` (token + sha256 + AES-GCM esistente), vitest.

## Global Constraints

- Tutte le risposte utente e i commenti in **italiano**.
- Working dir: `/Users/stefanoghisoni/Desktop/Siti web/App Shopify + Supabase/shopify-supabase-sync` (NON la home).
- La **service_role non lascia mai il client**: usata solo server-side nel proxy.
- Host di inoltro derivato **solo** dal `supabaseProjectRef` memorizzato (anti-SSRF).
- Solo metodo **GET**; blocco = **403**; token assente/errato = **401**; non collegato = **409**.
- Ogni commit termina con i trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` e `Claude-Session: https://claude.ai/code/session_01BgdN4JmBrjnHK6Edv3LFdC`.
- Prima di ogni commit: `npx tsc --noEmit`, `npx vitest run`, `npm run build` verdi.

## File Structure

- `prisma/schema.prisma` — 2 campi su `Shop`: `readProxyTokenHash`, `readProxyTokenEnc`.
- `app/lib/read-proxy/token.server.ts` — generazione/hash/estrazione/emissione/display del token.
- `app/lib/read-proxy/context.server.ts` — risoluzione token→contesto shop con cache 30s.
- `app/lib/read-proxy/forward.server.ts` — allowlist tabelle, costruzione URL, inoltro con service_role.
- `app/routes/rest.v1.$table.tsx` — resource route del proxy (orchestrazione + codici di stato).
- `app/routes/api.supabase.select-project.tsx` — emette il token al collegamento se assente.
- `app/routes/settings.supabase.tsx` — mostra URL proxy + token, azione "rigenera".
- Test affiancati: `*.test.ts` per token/context/forward + `rest.v1.$table.test.ts`.

---

### Task 1: Campi Prisma per il token-proxy

**Files:**
- Modify: `prisma/schema.prisma:33-60` (modello `Shop`)

**Interfaces:**
- Produces: colonne `Shop.readProxyTokenHash: string | null` (unique), `Shop.readProxyTokenEnc: string | null`.

- [ ] **Step 1: Aggiungi i campi al modello Shop**

In `prisma/schema.prisma`, dentro `model Shop`, subito dopo la riga `authorization`:

```prisma
  // Token-proxy per le letture di tracciamento (Stape/GTM). Persistito solo come
  // hash (lookup) + cifrato (per mostrarlo in Impostazioni), mai in chiaro.
  readProxyTokenHash String? @unique @map("read_proxy_token_hash")
  readProxyTokenEnc  String? @map("read_proxy_token_enc")
```

- [ ] **Step 2: Rigenera il client Prisma**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" senza errori.

- [ ] **Step 3: Applica le colonne al DB owner**

Esegui questo SQL nell'editor SQL della Supabase owner ("Tracking Sync") — additivo e non distruttivo (il pooler 6543 non esegue DDL migrate):

```sql
ALTER TABLE shops ADD COLUMN IF NOT EXISTS read_proxy_token_hash text;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS read_proxy_token_enc text;
CREATE UNIQUE INDEX IF NOT EXISTS shops_read_proxy_token_hash_key
  ON shops(read_proxy_token_hash);
```

- [ ] **Step 4: Verifica typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (il client conosce i nuovi campi).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: campi read_proxy_token su Shop"
```

---

### Task 2: Modulo token (generazione, hash, estrazione, emissione, display)

**Files:**
- Create: `app/lib/read-proxy/token.server.ts`
- Test: `app/lib/read-proxy/token.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` da `~/utils/crypto.server`; `prisma` da `~/db.server`.
- Produces:
  - `generateReadProxyToken(): string`
  - `hashReadProxyToken(token: string): string`
  - `extractReadProxyToken(request: Request): string | null`
  - `issueReadProxyToken(shopId: string): Promise<string>`
  - `getReadProxyTokenForDisplay(shop: { readProxyTokenEnc: string | null }): string | null`

- [ ] **Step 1: Scrivi i test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('~/utils/crypto.server', () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => v.replace(/^enc\(|\)$/g, ''),
}));
vi.mock('~/db.server', () => ({ prisma: { shop: { update: vi.fn() } } }));

import {
  generateReadProxyToken,
  hashReadProxyToken,
  extractReadProxyToken,
  getReadProxyTokenForDisplay,
} from './token.server';

describe('generateReadProxyToken', () => {
  it('ha prefisso spx_ ed è univoco', () => {
    const a = generateReadProxyToken();
    const b = generateReadProxyToken();
    expect(a.startsWith('spx_')).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('hashReadProxyToken', () => {
  it('è deterministico e in hex a 64 char (sha256)', () => {
    expect(hashReadProxyToken('spx_x')).toBe(hashReadProxyToken('spx_x'));
    expect(hashReadProxyToken('spx_x')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashReadProxyToken('a')).not.toBe(hashReadProxyToken('b'));
  });
});

describe('extractReadProxyToken', () => {
  const req = (h: Record<string, string>) => new Request('https://x/rest/v1/products', { headers: h });
  it('estrae dal Bearer', () => {
    expect(extractReadProxyToken(req({ authorization: 'Bearer spx_abc' }))).toBe('spx_abc');
  });
  it('ripiega sull’header apikey', () => {
    expect(extractReadProxyToken(req({ apikey: 'spx_def' }))).toBe('spx_def');
  });
  it('ritorna null se assente', () => {
    expect(extractReadProxyToken(req({}))).toBeNull();
  });
});

describe('getReadProxyTokenForDisplay', () => {
  it('decifra il token memorizzato', () => {
    expect(getReadProxyTokenForDisplay({ readProxyTokenEnc: 'enc(spx_z)' })).toBe('spx_z');
  });
  it('ritorna null se non emesso', () => {
    expect(getReadProxyTokenForDisplay({ readProxyTokenEnc: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npx vitest run app/lib/read-proxy/token.test.ts`
Expected: FAIL ("Failed to resolve import './token.server'").

- [ ] **Step 3: Implementa il modulo**

```ts
import crypto from 'crypto';
import { prisma } from '~/db.server';
import { encrypt, decrypt } from '~/utils/crypto.server';

const TOKEN_PREFIX = 'spx_';

// Token di lettura per-shop: prefisso identificativo + 32 byte casuali base64url.
export function generateReadProxyToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

// Solo l'hash viene persistito e indicizzato: il lookup dal token è O(1) e il
// token in chiaro non è mai salvato nel DB.
export function hashReadProxyToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Stape invia lo stesso valore sia in Authorization: Bearer sia nell'header
// apikey: leggiamo il primo, con ripiego sul secondo.
export function extractReadProxyToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) {
    const t = auth.replace(/^Bearer\s+/i, '').trim();
    if (t) return t;
  }
  const apikey = request.headers.get('apikey');
  return apikey && apikey.trim() ? apikey.trim() : null;
}

// Genera un nuovo token, salva hash + cifrato e ritorna il token in chiaro
// (mostrabile una volta / rileggibile dal cifrato). Invalida il precedente.
export async function issueReadProxyToken(shopId: string): Promise<string> {
  const token = generateReadProxyToken();
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      readProxyTokenHash: hashReadProxyToken(token),
      readProxyTokenEnc: encrypt(token),
    },
  });
  return token;
}

export function getReadProxyTokenForDisplay(
  shop: { readProxyTokenEnc: string | null },
): string | null {
  if (!shop.readProxyTokenEnc) return null;
  try {
    return decrypt(shop.readProxyTokenEnc);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npx vitest run app/lib/read-proxy/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/read-proxy/token.server.ts app/lib/read-proxy/token.test.ts
git commit -m "feat: modulo token-proxy (genera/hash/estrai/emetti/mostra)"
```

---

### Task 3: Risoluzione contesto shop con cache 30s

**Files:**
- Create: `app/lib/read-proxy/context.server.ts`
- Test: `app/lib/read-proxy/context.test.ts`

**Interfaces:**
- Consumes: `prisma` (`~/db.server`), `decrypt` (`~/utils/crypto.server`), `normalizeAuthorization`/`AuthorizationState` (`~/utils/authorization.server`), `hashReadProxyToken` (`./token.server`).
- Produces:
  - `interface ShopReadContext { shopId: string; authorization: AuthorizationState; projectRef: string; serviceRoleKey: string; customersEnabled: boolean }`
  - `type ReadContextResult = { kind: 'unknown' } | { kind: 'not_configured' } | { kind: 'ok'; ctx: ShopReadContext }`
  - `resolveShopReadContext(token: string): Promise<ReadContextResult>`
  - `clearReadContextCache(): void`

- [ ] **Step 1: Scrivi i test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const planFindUnique = vi.fn();
vi.mock('~/db.server', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => findUnique(...a) },
    plan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
  },
}));
vi.mock('~/utils/crypto.server', () => ({ decrypt: (v: string) => v.replace(/^enc\(|\)$/g, '') }));

import { resolveShopReadContext, clearReadContextCache } from './context.server';

const shopRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  authorization: 'ENABLED',
  currentPlan: 'free',
  supabaseConfig: {
    supabaseProjectRef: 'abcref',
    supabaseServiceRoleKey: 'enc(svc)',
  },
  ...over,
});

describe('resolveShopReadContext', () => {
  beforeEach(() => {
    findUnique.mockReset();
    planFindUnique.mockReset();
    clearReadContextCache();
  });

  it('token sconosciuto → kind unknown', async () => {
    findUnique.mockResolvedValueOnce(null);
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({ kind: 'unknown' });
  });

  it('shop senza config → not_configured', async () => {
    findUnique.mockResolvedValueOnce(shopRow({ supabaseConfig: null }));
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({ kind: 'not_configured' });
  });

  it('ok → ctx con service_role decifrata e customersEnabled dal piano', async () => {
    findUnique.mockResolvedValueOnce(shopRow());
    planFindUnique.mockResolvedValueOnce({ customersSyncEnabled: true });
    const r = await resolveShopReadContext('spx_x');
    expect(r).toEqual({
      kind: 'ok',
      ctx: {
        shopId: 's1',
        authorization: 'ENABLED',
        projectRef: 'abcref',
        serviceRoleKey: 'svc',
        customersEnabled: true,
      },
    });
  });

  it('usa la cache entro il TTL (una sola query per token)', async () => {
    findUnique.mockResolvedValue(shopRow());
    planFindUnique.mockResolvedValue({ customersSyncEnabled: false });
    await resolveShopReadContext('spx_same');
    await resolveShopReadContext('spx_same');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npx vitest run app/lib/read-proxy/context.test.ts`
Expected: FAIL ("Failed to resolve import './context.server'").

- [ ] **Step 3: Implementa il modulo**

```ts
import { prisma } from '~/db.server';
import { decrypt } from '~/utils/crypto.server';
import { normalizeAuthorization, type AuthorizationState } from '~/utils/authorization.server';
import { hashReadProxyToken } from './token.server';

export interface ShopReadContext {
  shopId: string;
  authorization: AuthorizationState;
  projectRef: string;
  serviceRoleKey: string;
  customersEnabled: boolean;
}

export type ReadContextResult =
  | { kind: 'unknown' }
  | { kind: 'not_configured' }
  | { kind: 'ok'; ctx: ShopReadContext };

// Cache per-istanza: evita un round-trip al DB owner ad ogni lettura di
// tracciamento. TTL 30s = finestra massima di obsolescenza dello stato shop.
const TTL_MS = 30_000;
const cache = new Map<string, { result: ReadContextResult; expiresAt: number }>();

export function clearReadContextCache(): void {
  cache.clear();
}

export async function resolveShopReadContext(token: string): Promise<ReadContextResult> {
  const hash = hashReadProxyToken(token);
  const now = Date.now();
  const cached = cache.get(hash);
  if (cached && cached.expiresAt > now) return cached.result;

  const result = await loadReadContext(hash);
  cache.set(hash, { result, expiresAt: now + TTL_MS });
  return result;
}

async function loadReadContext(hash: string): Promise<ReadContextResult> {
  const shop = await prisma.shop.findUnique({
    where: { readProxyTokenHash: hash },
    include: { supabaseConfig: true },
  });
  if (!shop) return { kind: 'unknown' };

  const config = shop.supabaseConfig;
  if (!config?.supabaseProjectRef || !config.supabaseServiceRoleKey) {
    return { kind: 'not_configured' };
  }

  let serviceRoleKey: string;
  try {
    serviceRoleKey = decrypt(config.supabaseServiceRoleKey);
  } catch {
    return { kind: 'not_configured' };
  }

  const plan = await prisma.plan.findUnique({ where: { planName: shop.currentPlan } });

  return {
    kind: 'ok',
    ctx: {
      shopId: shop.id,
      authorization: normalizeAuthorization(shop.authorization),
      projectRef: config.supabaseProjectRef,
      serviceRoleKey,
      customersEnabled: plan?.customersSyncEnabled ?? false,
    },
  };
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npx vitest run app/lib/read-proxy/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/read-proxy/context.server.ts app/lib/read-proxy/context.test.ts
git commit -m "feat: risoluzione contesto shop dal token-proxy con cache 30s"
```

---

### Task 4: Allowlist tabelle e inoltro con service_role

**Files:**
- Create: `app/lib/read-proxy/forward.server.ts`
- Test: `app/lib/read-proxy/forward.test.ts`

**Interfaces:**
- Consumes: `ShopReadContext` da `./context.server`.
- Produces:
  - `allowedReadTables(customersEnabled: boolean): string[]`
  - `buildSupabaseReadUrl(projectRef: string, table: string, search: string): string`
  - `interface ForwardResult { status: number; body: string; contentType: string }`
  - `forwardRead(ctx: ShopReadContext, table: string, search: string): Promise<ForwardResult>`

- [ ] **Step 1: Scrivi i test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowedReadTables, buildSupabaseReadUrl, forwardRead } from './forward.server';

describe('allowedReadTables', () => {
  it('solo products senza clienti; products+customers con clienti', () => {
    expect(allowedReadTables(false)).toEqual(['products']);
    expect(allowedReadTables(true)).toEqual(['products', 'customers']);
  });
});

describe('buildSupabaseReadUrl', () => {
  it('host dal ref, querystring preservata', () => {
    expect(buildSupabaseReadUrl('abcref', 'products', '?sku=eq.X')).toBe(
      'https://abcref.supabase.co/rest/v1/products?sku=eq.X',
    );
  });
  it('nessuna querystring quando vuota o "?"', () => {
    expect(buildSupabaseReadUrl('abcref', 'products', '')).toBe(
      'https://abcref.supabase.co/rest/v1/products',
    );
    expect(buildSupabaseReadUrl('abcref', 'products', '?')).toBe(
      'https://abcref.supabase.co/rest/v1/products',
    );
  });
});

describe('forwardRead', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  const ctx = {
    shopId: 's1', authorization: 'ENABLED' as const, projectRef: 'abcref',
    serviceRoleKey: 'svc', customersEnabled: true,
  };

  it('inoltra con service_role e propaga status/body/content-type', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      status: 200,
      text: async () => '[{"id":1}]',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    });
    const r = await forwardRead(ctx, 'products', '?sku=eq.X');
    expect(r).toEqual({ status: 200, body: '[{"id":1}]', contentType: 'application/json' });
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://abcref.supabase.co/rest/v1/products?sku=eq.X');
    expect(init.method).toBe('GET');
    expect(init.headers.apikey).toBe('svc');
    expect(init.headers.Authorization).toBe('Bearer svc');
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npx vitest run app/lib/read-proxy/forward.test.ts`
Expected: FAIL ("Failed to resolve import './forward.server'").

- [ ] **Step 3: Implementa il modulo**

```ts
import type { ShopReadContext } from './context.server';

// products sempre; customers solo se il piano include la sync clienti.
export function allowedReadTables(customersEnabled: boolean): string[] {
  return customersEnabled ? ['products', 'customers'] : ['products'];
}

// Host derivato SOLO dal ref memorizzato: nessun input utente nell'host (anti-SSRF).
export function buildSupabaseReadUrl(projectRef: string, table: string, search: string): string {
  const qs = search && search !== '?' ? search : '';
  return `https://${projectRef}.supabase.co/rest/v1/${table}${qs}`;
}

export interface ForwardResult {
  status: number;
  body: string;
  contentType: string;
}

export async function forwardRead(
  ctx: ShopReadContext,
  table: string,
  search: string,
): Promise<ForwardResult> {
  const url = buildSupabaseReadUrl(ctx.projectRef, table, search);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: ctx.serviceRoleKey,
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
      Accept: 'application/json',
    },
  });
  const body = await res.text();
  return {
    status: res.status,
    body,
    contentType: res.headers.get('content-type') ?? 'application/json',
  };
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npx vitest run app/lib/read-proxy/forward.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/read-proxy/forward.server.ts app/lib/read-proxy/forward.test.ts
git commit -m "feat: allowlist tabelle e inoltro con service_role (anti-SSRF)"
```

---

### Task 5: Resource route del proxy `/rest/v1/:table`

**Files:**
- Create: `app/routes/rest.v1.$table.tsx`
- Test: `app/routes/rest.v1.$table.test.ts`

**Interfaces:**
- Consumes: `extractReadProxyToken` (`~/lib/read-proxy/token.server`), `resolveShopReadContext` (`~/lib/read-proxy/context.server`), `allowedReadTables`/`forwardRead` (`~/lib/read-proxy/forward.server`).
- Produces: `loader({ request, params })` → `Response`.

- [ ] **Step 1: Scrivi i test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveShopReadContext = vi.fn();
const forwardRead = vi.fn();
vi.mock('~/lib/read-proxy/context.server', () => ({
  resolveShopReadContext: (...a: unknown[]) => resolveShopReadContext(...a),
}));
vi.mock('~/lib/read-proxy/forward.server', () => ({
  allowedReadTables: (c: boolean) => (c ? ['products', 'customers'] : ['products']),
  forwardRead: (...a: unknown[]) => forwardRead(...a),
}));

import { loader } from './rest.v1.$table';

const call = (headers: Record<string, string>, table = 'products', url = 'https://app/rest/v1/products?sku=eq.X') =>
  loader({ request: new Request(url, { headers }), params: { table }, context: {} } as any);

const okCtx = (over: Record<string, unknown> = {}) => ({
  kind: 'ok',
  ctx: { shopId: 's1', authorization: 'ENABLED', projectRef: 'r', serviceRoleKey: 'svc', customersEnabled: false, ...over },
});

describe('proxy loader', () => {
  beforeEach(() => {
    resolveShopReadContext.mockReset();
    forwardRead.mockReset();
  });

  it('token mancante → 401', async () => {
    const res = await call({});
    expect(res.status).toBe(401);
  });

  it('token sconosciuto → 401', async () => {
    resolveShopReadContext.mockResolvedValueOnce({ kind: 'unknown' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(401);
  });

  it('non collegato → 409', async () => {
    resolveShopReadContext.mockResolvedValueOnce({ kind: 'not_configured' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(409);
  });

  it('PENDING → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ authorization: 'PENDING' }));
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('DISABLED → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ authorization: 'DISABLED' }));
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('tabella non ammessa dal piano → 403', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: false }));
    const res = await call({ authorization: 'Bearer spx_x' }, 'customers', 'https://app/rest/v1/customers');
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('ENABLED + tabella ok → inoltra e propaga status/body', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx());
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[{"id":1}]', contentType: 'application/json' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"id":1}]');
    const [, table, search] = forwardRead.mock.calls[0];
    expect(table).toBe('products');
    expect(search).toBe('?sku=eq.X');
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `npx vitest run app/routes/rest.v1.$table.test.ts`
Expected: FAIL ("Failed to resolve import './rest.v1.$table'").

- [ ] **Step 3: Implementa la route**

```tsx
import type { LoaderFunctionArgs } from '@remix-run/node';
import { extractReadProxyToken } from '~/lib/read-proxy/token.server';
import { resolveShopReadContext } from '~/lib/read-proxy/context.server';
import { allowedReadTables, forwardRead } from '~/lib/read-proxy/forward.server';

// Risposta di blocco: JSON minimale. Stape tratta ogni status non 2xx come
// "nessun dato", quindi il tracciamento prosegue senza errori all'utente finale.
function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Proxy di lettura Supabase-compatibile. Definendo SOLO il loader, ogni metodo
// diverso da GET/HEAD riceve 405 da Remix.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = extractReadProxyToken(request);
  if (!token) return deny(401, 'Token di lettura mancante.');

  const result = await resolveShopReadContext(token);
  if (result.kind === 'unknown') return deny(401, 'Token di lettura non valido.');
  if (result.kind === 'not_configured') return deny(409, 'Supabase non collegato.');

  const { ctx } = result;
  if (ctx.authorization !== 'ENABLED') {
    return deny(403, 'Accesso ai dati sospeso per questo negozio.');
  }

  const table = params.table ?? '';
  if (!allowedReadTables(ctx.customersEnabled).includes(table)) {
    return deny(403, 'Tabella non disponibile.');
  }

  const search = new URL(request.url).search;
  const { status, body, contentType } = await forwardRead(ctx, table, search);
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `npx vitest run app/routes/rest.v1.$table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routes/rest.v1.\$table.tsx app/routes/rest.v1.\$table.test.ts
git commit -m "feat: resource route proxy /rest/v1/:table con gating stato shop"
```

---

### Task 6: Emissione del token al collegamento

**Files:**
- Modify: `app/routes/api.supabase.select-project.tsx:66-77` (dopo l'update `connectionVerifiedAt`)

**Interfaces:**
- Consumes: `issueReadProxyToken` (`~/lib/read-proxy/token.server`).

- [ ] **Step 1: Aggiungi l'import**

In cima a `app/routes/api.supabase.select-project.tsx`, con gli altri import:

```ts
import { issueReadProxyToken } from '~/lib/read-proxy/token.server';
```

- [ ] **Step 2: Emetti il token dopo il collegamento riuscito**

Subito dopo il blocco `await prisma.supabaseConfig.update({ ... connectionVerifiedAt: new Date(), syncEnabled: true })` e prima di `return json({ ok: true })`:

```ts
    // Emette il token-proxy per le letture di tracciamento se lo shop non ne ha
    // già uno (una riconnessione mantiene il token esistente, così il merchant
    // non deve riconfigurare Stape).
    const existing = await prisma.shop.findUnique({
      where: { id: shop.id },
      select: { readProxyTokenHash: true },
    });
    if (!existing?.readProxyTokenHash) {
      await issueReadProxyToken(shop.id);
    }
```

- [ ] **Step 3: Verifica typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api.supabase.select-project.tsx
git commit -m "feat: emette il token-proxy al collegamento Supabase"
```

---

### Task 7: Impostazioni — URL proxy, token e rigenerazione

**Files:**
- Modify: `app/routes/settings.supabase.tsx` (loader, action, render del blocco chiavi)

**Interfaces:**
- Consumes: `getReadProxyTokenForDisplay`, `issueReadProxyToken` (`~/lib/read-proxy/token.server`).

- [ ] **Step 1: Estendi il loader**

In `app/routes/settings.supabase.tsx`, aggiungi l'import:

```ts
import { getReadProxyTokenForDisplay, issueReadProxyToken } from '~/lib/read-proxy/token.server';
```

Il loader carica già `shop` con `include: { supabaseConfig: true }`. Aggiungi `readProxyTokenEnc` alla lettura e includi nel `config` restituito il token e l'URL base:

```ts
  const readToken = getReadProxyTokenForDisplay({
    readProxyTokenEnc: shop?.readProxyTokenEnc ?? null,
  });
  const proxyBaseUrl = process.env.SHOPIFY_APP_URL ?? '';
```

e nel `return json({ config: { ... } })` aggiungi:

```ts
      readToken,
      proxyBaseUrl,
```

- [ ] **Step 2: Gestisci la rigenerazione nell'action**

Nell'`action`, prima dell'aggiornamento di `syncEnabled`, gestisci l'intent di rigenerazione:

```ts
  const intent = formData.get('intent');
  if (intent === 'regenerate-read-token') {
    await issueReadProxyToken(shop.id);
    return json({ success: 'Chiave di lettura rigenerata. Aggiorna la configurazione in Stape/GTM.' });
  }
```

(Il form della sincronizzazione esistente non invia `intent`, quindi il ramo non lo intercetta.)

- [ ] **Step 3: Sostituisci la anon key con URL proxy + token**

Nel render, sostituisci il `CopyableField label="Public key (anon)"` con:

```tsx
                    <CopyableField label="URL di lettura (Stape/GTM)" value={config.proxyBaseUrl} />
                    <CopyableField label="Chiave di lettura" value={config.readToken ?? ''} />
                    <Text as="p" tone="subdued">
                      In Stape/GTM imposta <code>projectUrl</code> = URL di lettura e
                      <code> apiKey</code> = Chiave di lettura. La sincronizzazione dei dati
                      resta attiva solo finché il negozio è abilitato.
                    </Text>
                    <Form method="post">
                      <input type="hidden" name="intent" value="regenerate-read-token" />
                      <Button submit tone="critical" variant="secondary">
                        Rigenera chiave di lettura
                      </Button>
                    </Form>
```

(La `CopyableField label="URL del progetto"` di Supabase resta invariata sopra.)

- [ ] **Step 4: Verifica typecheck, test e build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tutto verde.

- [ ] **Step 5: Commit**

```bash
git add app/routes/settings.supabase.tsx
git commit -m "feat: Impostazioni mostrano URL proxy + chiave di lettura con rigenerazione"
```

---

### Task 8: Verifica end-to-end e push

**Files:** nessuno (verifica)

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck pulito, tutti i test verdi, build ok.

- [ ] **Step 2: Prova manuale del proxy (dopo il deploy)**

Con lo shop `ENABLED`, dal token in Impostazioni:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <TOKEN>" \
  "https://supabase-sync-six.vercel.app/rest/v1/products?limit=1"
```
Expected: `200`. Poi imposta lo shop a `PENDING`/`DISABLED` nel DB owner e ripeti (entro ~30s per la cache): Expected `403`. Token errato: Expected `401`.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Note operative (una tantum)

- Eseguire lo **SQL del Task 1 Step 3** nell'editor SQL della Supabase owner prima del deploy (le colonne devono esistere).
- I merchant già collegati **prima** di questa feature non hanno un token: si emette alla **prossima riconnessione**, oppure aggiungere (fuori scope) un backfill che chiama `issueReadProxyToken` per gli shop con `connectionVerifiedAt` e senza `readProxyTokenHash`.

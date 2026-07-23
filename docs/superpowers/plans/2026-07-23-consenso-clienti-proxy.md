# Consenso clienti nel proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il proxy `/rest/v1/customers` permette l'uso dei dati cliente solo se c'è il consenso al marketing: 403 sui lookup mirati a non consenzienti, filtro forzato ai soli consenzienti sulle letture-lista.

**Architecture:** Un modulo puro (`customer-consent.server.ts`) fornisce le funzioni di riconoscimento query e decisione; il loader di `rest.v1.$table.tsx` le orchestra usando `forwardRead` (service_role) per un'eventuale query di controllo consenso. Nessuna modifica alla sync.

**Tech Stack:** Remix 2 resource route, TypeScript, Vitest. PostgREST query params.

## Global Constraints

- Enforcement SOLO su `table === 'customers'`; `products` invariato.
- Consenso = `accepts_marketing === true` (false o null = non consenziente).
- Colonne identificative univoche: `email`, `phone`, `shopify_customer_id`. Lookup mirato = filtro `eq` su una di queste.
- Messaggio 403 esatto e verbatim: `L'utente non ha acconsentito al marketing su Shopify`.
- La query di controllo consenso usa la service_role via `forwardRead`; il suo corpo NON va restituito al chiamante.
- Fail-closed: se la query di controllo non torna un `200` con array JSON valido → 403.
- `new URLSearchParams(search)` ignora il `?` iniziale (comportamento standard, già usato in `forward.server.ts`).
- TDD; `npm test` e `npm run build` verdi a fine di ogni task.

---

### Task 1: Modulo puro consenso clienti

**Files:**
- Create: `app/lib/read-proxy/customer-consent.server.ts`
- Test: `app/lib/read-proxy/customer-consent.test.ts`

**Interfaces:**
- Produces:
  - `IDENTIFIER_COLUMNS: string[]`
  - `isCustomerIdentifierLookup(search: string): boolean`
  - `consentCheckSearch(search: string): string`
  - `forceConsentedOnlySearch(search: string): string`
  - `rowsHaveNonConsented(rows: Array<{ accepts_marketing?: unknown }>): boolean`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// app/lib/read-proxy/customer-consent.test.ts
import { describe, it, expect } from 'vitest';
import {
  isCustomerIdentifierLookup,
  consentCheckSearch,
  forceConsentedOnlySearch,
  rowsHaveNonConsented,
} from './customer-consent.server';

describe('customer-consent', () => {
  describe('isCustomerIdentifierLookup', () => {
    it('email=eq.x → true', () => {
      expect(isCustomerIdentifierLookup('?email=eq.foo@bar.com')).toBe(true);
    });
    it('shopify_customer_id=eq.1 → true', () => {
      expect(isCustomerIdentifierLookup('?shopify_customer_id=eq.1')).toBe(true);
    });
    it('phone=eq.+39 → true', () => {
      expect(isCustomerIdentifierLookup('?phone=eq.+390000')).toBe(true);
    });
    it('nessun eq identificativo → false', () => {
      expect(isCustomerIdentifierLookup('?select=*&limit=3')).toBe(false);
    });
    it('eq su colonna non identificativa → false', () => {
      expect(isCustomerIdentifierLookup('?last_name=eq.Rossi')).toBe(false);
    });
  });

  describe('consentCheckSearch', () => {
    it('preserva il filtro e imposta select=accepts_marketing', () => {
      const out = consentCheckSearch('?email=eq.foo@bar.com&select=*');
      const p = new URLSearchParams(out);
      expect(p.get('select')).toBe('accepts_marketing');
      expect(p.get('email')).toBe('eq.foo@bar.com');
    });
  });

  describe('forceConsentedOnlySearch', () => {
    it('da ?select=* aggiunge il filtro consenzienti', () => {
      expect(forceConsentedOnlySearch('?select=*')).toBe('?select=*&accepts_marketing=eq.true');
    });
    it('da stringa vuota parte con ?', () => {
      expect(forceConsentedOnlySearch('')).toBe('?accepts_marketing=eq.true');
    });
  });

  describe('rowsHaveNonConsented', () => {
    it('tutti true → false', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: true }])).toBe(false);
    });
    it('un false → true', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: true }, { accepts_marketing: false }])).toBe(true);
    });
    it('null → true', () => {
      expect(rowsHaveNonConsented([{ accepts_marketing: null }])).toBe(true);
    });
    it('vuoto → false', () => {
      expect(rowsHaveNonConsented([])).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `npx vitest run app/lib/read-proxy/customer-consent.test.ts`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa il modulo**

```ts
// app/lib/read-proxy/customer-consent.server.ts

// Colonne univoche identificative: un filtro `eq` su una di queste è un "lookup
// mirato" a uno specifico cliente (es. email=eq.x).
export const IDENTIFIER_COLUMNS = ['email', 'phone', 'shopify_customer_id'];

// True se la query filtra con `eq` su una colonna identificativa.
// (URLSearchParams ignora il '?' iniziale della search.)
export function isCustomerIdentifierLookup(search: string): boolean {
  const params = new URLSearchParams(search);
  return IDENTIFIER_COLUMNS.some((col) => {
    const v = params.get(col);
    return v != null && v.startsWith('eq.');
  });
}

// Query di controllo consenso: stessi filtri, ma select=accepts_marketing.
export function consentCheckSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.set('select', 'accepts_marketing');
  return '?' + params.toString();
}

// Forza il filtro sui soli consenzienti (letture non mirate). Append di stringa
// per non ri-codificare eventuali filtri PostgREST complessi già presenti.
export function forceConsentedOnlySearch(search: string): string {
  const clean = search === '?' ? '' : search;
  const sep = clean.startsWith('?') ? '&' : '?';
  return `${clean}${sep}accepts_marketing=eq.true`;
}

// True se almeno una riga non è consenziente (false o null).
export function rowsHaveNonConsented(
  rows: Array<{ accepts_marketing?: unknown }>,
): boolean {
  return rows.some((r) => r.accepts_marketing !== true);
}
```

- [ ] **Step 4: Esegui e verifica il pass**

Run: `npx vitest run app/lib/read-proxy/customer-consent.test.ts`
Expected: PASS (tutti i test).

- [ ] **Step 5: Commit**

```bash
git add app/lib/read-proxy/customer-consent.server.ts app/lib/read-proxy/customer-consent.test.ts
git commit -m "feat: modulo consenso clienti per il proxy di lettura"
```

---

### Task 2: Enforcement consenso nel loader del proxy

**Files:**
- Modify: `app/routes/rest.v1.$table.tsx`
- Test: `app/routes/rest.v1.$table.test.ts`

**Interfaces:**
- Consumes: `isCustomerIdentifierLookup`, `consentCheckSearch`, `forceConsentedOnlySearch`, `rowsHaveNonConsented` (Task 1); `forwardRead` (esistente).
- Produces: comportamento del loader su `customers` (403 mirato / filtro forzato).

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in `app/routes/rest.v1.$table.test.ts`. Il file già mocka `forwardRead` (vi.fn) e `resolveShopReadContext`. NON mockare `customer-consent.server` (usa le funzioni reali). Casi:

```ts
  it('customers lookup mirato, cliente non consenziente → 403 e nessun inoltro dell\'originale', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    // 1a chiamata forwardRead = query di controllo consenso
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[{"accepts_marketing":false}]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?email=eq.foo@bar.com&select=*',
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("L'utente non ha acconsentito al marketing su Shopify");
    // solo la query di controllo, NON l'inoltro dell'originale
    expect(forwardRead).toHaveBeenCalledTimes(1);
  });

  it('customers lookup mirato, cliente consenziente → inoltra e restituisce i dati', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead
      .mockResolvedValueOnce({ status: 200, body: '[{"accepts_marketing":true}]', contentType: 'application/json' })
      .mockResolvedValueOnce({ status: 200, body: '[{"email":"foo@bar.com"}]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?email=eq.foo@bar.com',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('foo@bar.com');
    expect(forwardRead).toHaveBeenCalledTimes(2);
  });

  it('customers lookup mirato senza corrispondenze → inoltra (torna [])', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead
      .mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' })
      .mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?shopify_customer_id=eq.999',
    );
    expect(res.status).toBe(200);
    expect(forwardRead).toHaveBeenCalledTimes(2);
  });

  it('customers lettura non mirata → inoltra con accepts_marketing=eq.true', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?select=*&limit=10',
    );
    expect(forwardRead).toHaveBeenCalledTimes(1);
    const forwardedSearch = forwardRead.mock.calls[0][2] as string;
    expect(forwardedSearch).toContain('accepts_marketing=eq.true');
  });

  it('products non è toccato dal consenso', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    await call(
      { authorization: 'Bearer spx_x' },
      'products',
      'https://app/rest/v1/products?email=eq.foo@bar.com',
    );
    expect(forwardRead).toHaveBeenCalledTimes(1);
    const forwardedSearch = forwardRead.mock.calls[0][2] as string;
    expect(forwardedSearch).not.toContain('accepts_marketing');
  });
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `npx vitest run 'app/routes/rest.v1.$table.test.ts'`
Expected: FAIL — l'enforcement consenso non esiste ancora (403 non emesso, filtro non forzato).

- [ ] **Step 3: Integra l'enforcement nel loader**

In `app/routes/rest.v1.$table.tsx` aggiungi l'import:

```ts
import {
  isCustomerIdentifierLookup,
  consentCheckSearch,
  forceConsentedOnlySearch,
  rowsHaveNonConsented,
} from '~/lib/read-proxy/customer-consent.server';
```

Sostituisci il blocco finale del loader che oggi è:

```ts
  const search = new URL(request.url).search;
  // L'allowlist sul path non copre l'embedding PostgREST dentro `select`.
  if (selectEmbedsForbiddenTable(search, allowed)) {
    return deny(403, 'Tabella non disponibile.');
  }

  const { status, body, contentType } = await forwardRead(ctx, table, search);
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
```

con:

```ts
  const search = new URL(request.url).search;
  // L'allowlist sul path non copre l'embedding PostgREST dentro `select`.
  if (selectEmbedsForbiddenTable(search, allowed)) {
    return deny(403, 'Tabella non disponibile.');
  }

  // Enforcement consenso marketing: solo la tabella customers.
  let forwardSearch = search;
  if (table === 'customers') {
    if (isCustomerIdentifierLookup(search)) {
      // Lookup mirato: verifica il consenso del cliente puntato con la
      // service_role. Il corpo del controllo NON viene restituito al chiamante.
      const check = await forwardRead(ctx, 'customers', consentCheckSearch(search));
      if (check.status !== 200) {
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      let rows: Array<{ accepts_marketing?: unknown }>;
      try {
        rows = JSON.parse(check.body);
        if (!Array.isArray(rows)) throw new Error('non-array');
      } catch {
        // Fail-closed: risposta di controllo non interpretabile → nega.
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      if (rowsHaveNonConsented(rows)) {
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      // Consenzienti (o nessuna corrispondenza) → inoltra la query originale.
    } else {
      // Lettura non mirata: restituisci solo i consenzienti.
      forwardSearch = forceConsentedOnlySearch(search);
    }
  }

  const { status, body, contentType } = await forwardRead(ctx, table, forwardSearch);
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
```

- [ ] **Step 4: Esegui i test del proxy e verifica il pass**

Run: `npx vitest run 'app/routes/rest.v1.$table.test.ts'`
Expected: PASS (nuovi casi + quelli esistenti).

- [ ] **Step 5: Commit**

```bash
git add app/routes/rest.v1.$table.tsx app/routes/rest.v1.$table.test.ts
git commit -m "feat: proxy applica il consenso marketing sulle letture dei clienti"
```

---

### Task 3: Verifica finale

**Files:** nessuna modifica.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: tutti i test passano (esistenti + nuovi).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build client e server verdi.

## Note di verifica manuale (post-deploy)

Su uno store ENABLED con la sync clienti abilitata:
- `GET /rest/v1/customers?email=eq.<consenziente>` → dati.
- `GET /rest/v1/customers?email=eq.<non-consenziente>` → 403 col messaggio.
- `GET /rest/v1/customers?select=*` → solo clienti consenzienti.

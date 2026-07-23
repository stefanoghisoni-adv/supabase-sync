# Date del log nel fuso del negozio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrare nel log di sincronizzazione la data corretta fin dal primo render, formattandola nel fuso orario del negozio invece che in quello del dispositivo.

**Architecture:** Il server non può conoscere il fuso del browser, ma conosce quello del negozio: Shopify lo espone come `iana_timezone`. Salvandolo sullo `Shop` e passandolo a `Intl.DateTimeFormat` con `timeZone` esplicito, server e client producono la stessa identica stringa — niente disallineamento di idratazione, niente lampo, nessun loader necessario.

**Tech Stack:** Remix 2, TypeScript, Prisma, Shopify Admin API, `Intl.DateTimeFormat`, Vitest.

## Global Constraints

- Il formato visibile resta `GG/MM/AAAA HH:MM` (es. `24/07/2026 14:05`), come già prodotto oggi.
- `formatDateTime` deve essere **deterministica**: mai dipendere dal fuso della macchina che esegue il codice.
- **Fallback UTC** se il fuso del negozio manca o non è valido: deterministico anche in quel caso, mai un crash.
- Il recupero del fuso è **best effort**: un errore non deve mai far fallire il caricamento della dashboard.
- Restare in Polaris; nessun loader/spinner nella tabella (la data è disponibile lato server).
- TDD sulle funzioni pure. `npm test`, `npx tsc --noEmit`, `npm run build` verdi a fine di ogni task.

---

### Task 1: Fuso del negozio — lettura da Shopify e campo su Shop

**Files:**
- Modify: `app/lib/shopify-api.server.ts` (nuovo metodo, accanto a `getCustomersCount`)
- Modify: `prisma/schema.prisma` (campo su `Shop`)
- Create: `prisma/migrations/20260724100000_add_shop_timezone/migration.sql`
- Test: `app/lib/shopify-api.test.ts` (caso aggiuntivo)

**Interfaces:**
- Produces: `ShopifyAPIClient.getShopInfo(): Promise<{ ianaTimezone: string | null }>`; campo Prisma `Shop.ianaTimezone` (`String?`, colonna `iana_timezone`).

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in `app/lib/shopify-api.test.ts`, seguendo lo stile dei test già presenti nel file (che mockano `global.fetch`):

```ts
  it('getShopInfo restituisce il fuso orario del negozio', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ shop: { iana_timezone: 'Europe/Rome' } }),
    }) as unknown as typeof fetch;

    const client = new ShopifyAPIClient('test-shop.myshopify.com', 'enc');
    expect(await client.getShopInfo()).toEqual({ ianaTimezone: 'Europe/Rome' });
  });

  it('getShopInfo senza fuso restituisce null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ shop: {} }),
    }) as unknown as typeof fetch;

    const client = new ShopifyAPIClient('test-shop.myshopify.com', 'enc');
    expect(await client.getShopInfo()).toEqual({ ianaTimezone: null });
  });
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/lib/shopify-api.test.ts -t "getShopInfo"`
Expected: FAIL — `getShopInfo` non è una funzione.

- [ ] **Step 3: Implementa il metodo**

In `app/lib/shopify-api.server.ts`, subito dopo `getCustomersCount`:

```ts
  // Metadati del negozio. Serve iana_timezone (es. "Europe/Rome") per formattare
  // le date nel fuso del NEGOZIO: il server non puo' conoscere quello del browser,
  // e usare l'ora locale della macchina produrrebbe stringhe diverse fra render
  // server e idratazione client.
  async getShopInfo(): Promise<{ ianaTimezone: string | null }> {
    const { data } = await this.makeRequest('shop.json');
    const shop = (data as { shop?: { iana_timezone?: string | null } }).shop;
    return { ianaTimezone: shop?.iana_timezone ?? null };
  }
```

- [ ] **Step 4: Aggiungi il campo Prisma**

In `prisma/schema.prisma`, nel model `Shop`, subito dopo `authorization`:

```prisma
  // Fuso orario IANA del negozio (es. Europe/Rome), letto da Shopify e
  // memorizzato: rende le date del log identiche su server e client.
  ianaTimezone      String?            @map("iana_timezone")
```

- [ ] **Step 5: Crea la migration**

```sql
-- prisma/migrations/20260724100000_add_shop_timezone/migration.sql
-- Fuso orario IANA del negozio, usato per formattare le date del log in modo
-- deterministico. IF NOT EXISTS: idempotente anche se applicata a mano.
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "iana_timezone" TEXT;
```

- [ ] **Step 6: Rigenera il client e verifica**

Run: `npx prisma generate && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add app/lib/shopify-api.server.ts app/lib/shopify-api.test.ts prisma/schema.prisma prisma/migrations/20260724100000_add_shop_timezone/migration.sql
git commit -m "feat: legge e memorizza il fuso orario del negozio"
```

---

### Task 2: formatDateTime deterministica con fuso esplicito

**Files:**
- Modify: `app/components/Dashboard/sync-log-format.ts` (funzione `formatDateTime`)
- Modify: `app/components/Dashboard/sync-log-format.test.ts` (il test attuale usa l'ora locale e va sostituito)

**Interfaces:**
- Produces: `formatDateTime(iso: string, timeZone?: string | null): string`

- [ ] **Step 1: Sostituisci il test di formatDateTime**

Rimuovi il blocco `describe('formatDateTime', ...)` esistente (usa l'ora locale della macchina, che è proprio ciò che stiamo eliminando) e mettine uno deterministico:

```ts
describe('formatDateTime', () => {
  // Istante noto in UTC: le 12:05 UTC del 24 luglio 2026.
  const iso = '2026-07-24T12:05:00.000Z';

  it('formatta nel fuso indicato', () => {
    // Europe/Rome d'estate e UTC+2.
    expect(formatDateTime(iso, 'Europe/Rome')).toBe('24/07/2026 14:05');
  });

  it('fuso assente → UTC', () => {
    expect(formatDateTime(iso, null)).toBe('24/07/2026 12:05');
    expect(formatDateTime(iso)).toBe('24/07/2026 12:05');
  });

  it('fuso non valido → ricade su UTC senza lanciare', () => {
    expect(formatDateTime(iso, 'Non/Esiste')).toBe('24/07/2026 12:05');
  });

  it('fuso diverso produce un orario diverso dallo stesso istante', () => {
    expect(formatDateTime(iso, 'America/New_York')).toBe('24/07/2026 08:05');
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run app/components/Dashboard/sync-log-format.test.ts -t "formatDateTime"`
Expected: FAIL — la funzione attuale ignora il secondo argomento e usa l'ora locale.

- [ ] **Step 3: Implementa**

In `app/components/Dashboard/sync-log-format.ts` sostituisci l'helper `due` e la funzione `formatDateTime` con:

```ts
// Formatta SEMPRE nel fuso indicato, mai in quello della macchina: cosi' il
// render sul server e l'idratazione sul client producono la stessa stringa
// (niente disallineamento) e il merchant legge l'orario del proprio negozio.
// Fallback UTC se il fuso manca o non e' valido: deterministico comunque.
function formatIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}

export function formatDateTime(iso: string, timeZone?: string | null): string {
  try {
    return formatIn(iso, timeZone || 'UTC');
  } catch {
    // Fuso non riconosciuto dall'ambiente: non deve rompere la pagina.
    return formatIn(iso, 'UTC');
  }
}
```

(L'helper `due` non serve più: rimuovilo se non è usato altrove nel file.)

- [ ] **Step 4: Verifica il pass**

Run: `npx vitest run app/components/Dashboard/sync-log-format.test.ts`
Expected: PASS (tutti i casi del file).

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard/sync-log-format.ts app/components/Dashboard/sync-log-format.test.ts
git commit -m "feat: date del log formattate in un fuso esplicito e deterministico"
```

---

### Task 3: Propagazione del fuso fino al log

**Files:**
- Modify: `app/routes/_index.tsx` (loader: popolamento pigro + esposizione; componente: passaggio a `SyncLog`)
- Modify: `app/components/Dashboard/SyncLog.tsx` (nuova prop `timeZone`)

**Interfaces:**
- Consumes: `getShopInfo` e `Shop.ianaTimezone` (Task 1), `formatDateTime(iso, timeZone)` (Task 2).
- Produces: `SyncLog` con props `{ jobs; customersEnabled; timeZone: string | null }`

- [ ] **Step 1: Popola il fuso nel loader, una volta sola per negozio**

In `app/routes/_index.tsx`, dentro il `try` del loader, **dopo** `const shop = await getOrCreateShop(session);` e prima del `Promise.all` esistente:

```ts
    // Il fuso del negozio si legge una volta sola e resta memorizzato: da qui in
    // poi il costo e' zero. Best effort — se Shopify non risponde si usa UTC e
    // la dashboard si carica comunque.
    let shopTimezone = shop.ianaTimezone;
    if (!shopTimezone) {
      try {
        const info = await new ShopifyAPIClient(shop.shopDomain, shop.accessToken).getShopInfo();
        if (info.ianaTimezone) {
          shopTimezone = info.ianaTimezone;
          await prisma.shop.update({
            where: { id: shop.id },
            data: { ianaTimezone: info.ianaTimezone },
          });
        }
      } catch (err) {
        console.warn(
          '[dashboard loader] lettura fuso orario negozio fallita:',
          err instanceof Error ? err.message : 'errore sconosciuto',
        );
      }
    }
```

Aggiungi l'import se assente:

```ts
import { ShopifyAPIClient } from '~/lib/shopify-api.server';
```

- [ ] **Step 2: Esponi il fuso nella risposta del loader**

Nel `return json({...})` del loader aggiungi:

```ts
      shopTimezone,
```

- [ ] **Step 3: Passa il fuso al log**

Nel componente, aggiungi `shopTimezone` alla destrutturazione di `useLoaderData` e passalo:

```tsx
          <SyncLog
            jobs={recentJobs}
            customersEnabled={customersEnabled}
            timeZone={shopTimezone}
          />
```

- [ ] **Step 4: Accetta e usa la prop in SyncLog**

In `app/components/Dashboard/SyncLog.tsx`, aggiungi `timeZone` alle props e passalo alle due chiamate di `formatDateTime`:

```tsx
interface SyncLogProps {
  jobs: SerializedSyncJob[];
  customersEnabled: boolean;
  timeZone: string | null;
}
```

```tsx
export function SyncLog({ jobs, customersEnabled, timeZone }: SyncLogProps) {
```

e nel corpo, dove oggi c'è `formatDateTime(job.startedAt)`, usa `formatDateTime(job.startedAt, timeZone)` (in entrambi i rami: quello con la durata e quello senza).

- [ ] **Step 5: Verifica completa**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add app/routes/_index.tsx app/components/Dashboard/SyncLog.tsx
git commit -m "feat: il log mostra le date nel fuso orario del negozio"
```

---

## Nota per il deploy

La migration aggiunge la colonna `iana_timezone` alla tabella `shops` del database
**owner**. Il pooler sulla 6543 non esegue DDL, quindi va lanciata a mano nel SQL
editor di Supabase, come già fatto per le colonne del token-proxy:

```sql
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "iana_timezone" TEXT;
```

Finché la colonna non esiste, Prisma fallirebbe le query su `shops`: eseguire lo
SQL **prima** del deploy.

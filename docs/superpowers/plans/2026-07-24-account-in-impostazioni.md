# Card Account in Impostazioni + dashboard a due card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togliere la card Account dalla dashboard (che resta con Prodotti e Clienti a metà riga ciascuna), rimetterla in cima alle Impostazioni, e aggiungere una descrizione sotto il pulsante "Aggiorna piano".

**Architecture:** `AccountCard` non cambia: si sposta soltanto il punto in cui viene usata. Il loader delle Impostazioni viene esteso per fornirle i dati, tenendoli separati da quelli del progetto così che la card compaia anche quando Supabase non è collegato.

**Tech Stack:** Remix 2, React, Shopify Polaris 13, TypeScript, Prisma.

## Global Constraints

- **Tutto in Shopify Polaris.** Unica eccezione già esistente e da non estendere: l'overlay della card Clienti.
- Testo della descrizione **verbatim**: `Potenzia la trasmissione dei dati utente monitorando anche il lifetime value (LTV) e lifetime profit (LTP).`
- La descrizione è **grigia** (`tone="subdued"`) e sta **dentro l'overlay**, sotto il pulsante — non fra le righe nascoste, che devono restare inaccessibili.
- La modifica a due colonne riguarda **solo la prima riga** (quella delle ex tre card). La riga sottostante con Stepper e SyncLog è un `InlineGrid` separato e **non va toccata**.
- `AccountCard` **non va modificato**: cambia solo dove viene usato.
- La card Account in Impostazioni deve comparire **anche quando Supabase non è collegato**.
- **Non esiste infrastruttura per test di componenti React**: non aggiungerla, non scrivere test di rendering. La verifica è `npm test` (nessuna regressione), `npx tsc --noEmit`, `npm run build`.
- La suite deve riportare **256 test** a inizio lavoro: se ne vedi molti meno il comando è stato interrotto, rilancialo.

---

### Task 1: Dashboard a due card + descrizione sotto il pulsante

**Files:**
- Modify: `app/routes/_index.tsx` (prima riga di card, righe ~456-475; loader)
- Modify: `app/components/Dashboard/CustomersCard.tsx` (overlay)

**Interfaces:**
- Produces: la dashboard non usa più `AccountCard`; `CustomersCard` mostra la descrizione sotto il pulsante.

- [ ] **Step 1: Porta la prima riga a due card**

In `app/routes/_index.tsx` sostituisci il blocco:

```tsx
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <AccountCard
            connected={supabaseConnected}
            planName={shop.currentPlan}
            syncFrequencyHours={syncFrequencyHours}
          />
          <ProductsCard
```

con:

```tsx
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <ProductsCard
```

Il resto del blocco (ProductsCard, CustomersCard e la chiusura `</InlineGrid>`) resta identico. **Non toccare** l'`InlineGrid` successivo, quello di Stepper e SyncLog.

- [ ] **Step 2: Rimuovi import e dati ora inutilizzati**

Rimuovi l'import di `AccountCard`:

```tsx
import { AccountCard } from '~/components/Dashboard/AccountCard';
```

`syncFrequencyHours` serviva solo a quella card: rimuovilo dalla destrutturazione di `useLoaderData` e dal `return json({...})` del loader, insieme alla riga che lo calcolava (`syncFrequencyHours: plan?.maxSyncFrequencyHours ?? null`).

**Attenzione:** `supabaseConnected` **resta** — lo usa anche lo Stepper. Non rimuoverlo.

**`tsc` NON segnala gli import inutilizzati in questo progetto** (`noUnusedLocals` non è attivo): verifica a mano che non restino simboli orfani.

```bash
grep -n "AccountCard\|syncFrequencyHours\|supabaseConnected" app/routes/_index.tsx
```

Atteso dopo la modifica: nessuna occorrenza di `AccountCard` né di `syncFrequencyHours`; `supabaseConnected` ancora presente.

- [ ] **Step 3: Aggiungi la descrizione sotto il pulsante**

In `app/components/Dashboard/CustomersCard.tsx`, dentro l'overlay, sostituisci:

```tsx
              <Tooltip content="Presto disponibile">
                <Button variant="primary" disabled>
                  Aggiorna piano
                </Button>
              </Tooltip>
```

con:

```tsx
              <BlockStack gap="200" inlineAlign="center">
                <Tooltip content="Presto disponibile">
                  <Button variant="primary" disabled>
                    Aggiorna piano
                  </Button>
                </Tooltip>
                {/* Sta nell'overlay insieme al pulsante, non fra le righe velate:
                    quelle sono aria-hidden, questa deve restare leggibile. */}
                <Box paddingInline="400">
                  <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                    Potenzia la trasmissione dei dati utente monitorando anche il
                    lifetime value (LTV) e lifetime profit (LTP).
                  </Text>
                </Box>
              </BlockStack>
```

`BlockStack`, `Box` e `Text` sono già importati nel file: verifica e, se manca `Box`, aggiungilo all'import da `@shopify/polaris`.

- [ ] **Step 4: Verifica**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 256 test verdi (nessuna regressione), tipi puliti, build verde.

- [ ] **Step 5: Commit**

```bash
git add app/routes/_index.tsx app/components/Dashboard/CustomersCard.tsx
git commit -m "feat: dashboard a due card e descrizione sotto Aggiorna piano"
```

---

### Task 2: Card Account in cima alle Impostazioni

**Files:**
- Modify: `app/routes/settings.supabase.tsx` (loader e render)

**Interfaces:**
- Consumes: `AccountCard` (invariato) con props `{ connected: boolean; planName: string; syncFrequencyHours: number | null }`.

- [ ] **Step 1: Estendi il loader**

In `app/routes/settings.supabase.tsx`, il loader oggi restituisce `{ config: null }` quando manca `supabaseConfig`, uscendo prima. Va ristrutturato perché le informazioni di account servono **sempre**.

Aggiungi il recupero del piano dopo la lettura dello shop:

```ts
  // Il piano serve alla card Account (frequenza di sync prevista dal piano).
  const plan = await prisma.plan.findUnique({
    where: { planName: shop?.currentPlan ?? '' },
  });

  // Informazioni di account: sempre presenti, anche senza collegamento — proprio
  // in quel caso "Database: Non collegato" e' l'informazione piu' utile.
  const account = {
    connected: !!shop?.supabaseConfig?.connectionVerifiedAt,
    planName: shop?.currentPlan ?? '',
    syncFrequencyHours: plan?.maxSyncFrequencyHours ?? null,
  };
```

Sostituisci il ritorno anticipato:

```ts
  if (!config) {
    return json({ config: null });
  }
```

con:

```ts
  if (!config) {
    return json({ account, config: null });
  }
```

e aggiungi `account` anche al `return json({...})` finale, accanto a `config`.

- [ ] **Step 2: Rendi la card in cima alla pagina**

Aggiungi l'import:

```tsx
import { AccountCard } from '~/components/Dashboard/AccountCard';
```

Nella destrutturazione di `useLoaderData` aggiungi `account`.

Dentro `<BlockStack gap="400">`, **subito dopo i banner di successo/errore e prima del blocco `{!config ? … : …}`**, inserisci:

```tsx
            <AccountCard
              connected={account.connected}
              planName={account.planName}
              syncFrequencyHours={account.syncFrequencyHours}
            />
```

Così la card compare in cima sia quando Supabase è collegato sia quando non lo è.

- [ ] **Step 3: Verifica**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 256 test verdi, tipi puliti, build verde.

- [ ] **Step 4: Commit**

```bash
git add app/routes/settings.supabase.tsx
git commit -m "feat: card Account in cima alle Impostazioni"
```

---

## Note di verifica manuale (post-deploy)

- Dashboard: due card affiancate, Prodotti a sinistra e Clienti a destra; sotto,
  invariata, la riga con Stepper e Log di sincronizzazione.
- Impostazioni: card Account in cima con Database, Piano e Frequenza sync.
- Card Clienti su piano free: sotto "Aggiorna piano" compare la descrizione grigia.

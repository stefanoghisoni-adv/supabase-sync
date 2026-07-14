# Dashboard Stepper Redesign — Design Specification

**Data:** 2026-07-14
**Autore:** Stefano Ghisoni
**Stato:** Approvata — da implementare
**Progetto:** App Shopify + Supabase (Vercel + Redis) — `shopify-supabase-sync`

---

## 1. Contesto e obiettivi

Riorganizzare la UI dell'app embedded Shopify (Remix + Polaris) attorno a uno
**stepper verticale guidato** che chiude gli step completati e apre il successivo
man mano che l'onboarding procede. Contestualmente, ridefinire le StatsCard della
dashboard su metriche realmente utili al merchant (idoneità dei prodotti al sync),
sistemare la larghezza/allineamento dei pulsanti, e sostituire la pagina bianca
"Application Error" con un banner d'errore Polaris esplicito.

### Obiettivi

- Onboarding chiaro a step: prima si collega Supabase, poi si sincronizza.
- StatsCard che dicono al merchant *quanti prodotti sono pronti* e *quanti hanno problemi*.
- Pulsanti dimensionati al contenuto (mai full-width), in Impostazioni allineati a destra in colonna.
- Nessuna schermata bianca di errore: sempre il guscio dell'app + banner rosso con messaggio preciso.

### Fuori scope

- Modifiche alla logica di sync sottostante (webhook, worker, cron).
- Preview interattivo delle tabelle di destinazione (si usa preview statico).
- Nuovi piani o modifiche al billing.

---

## 2. Layout della Dashboard (`app/routes/_index.tsx`)

Stile stepper: **minimalista** — linea verticale che connette gli step, icone di stato
(✓ completato, → attivo, ⊘ bloccato), step completati collassati, step attivo esteso.

```
Page "Dashboard"
├── PlanBanner                          (invariato)
├── StatsCard Grid                      (contenuto nuovo — §3)
│     • Prodotti totali
│     • Prodotti pronti      (cost_per_item compilato)
│     • Prodotti con problemi (cost_per_item mancante)
│     • Clienti              → SOLO se plan.customersSyncEnabled === true
├── Stepper verticale                   (sostituisce la card "Sync Controls" — §4)
│     ✓ Step 1 · Collega Supabase
│     → Step 2 · Sincronizza prodotti [e clienti]
└── ActivityLog                         (visibile SOLO quando Step 2 è attivo/sbloccato)
```

L'attuale card "Sync Controls" e il pulsante "Sync Now" vengono assorbiti dallo Step 2.

---

## 3. StatsCard — dati live da Shopify in background

### Metriche

| Card | Definizione |
|---|---|
| **Prodotti totali** | Numero di prodotti nel catalogo Shopify |
| **Prodotti pronti** | Prodotti/varianti **idonei** al sync: hanno `cost_per_item` valorizzato |
| **Prodotti con problemi** | Prodotti/varianti a cui **manca** `cost_per_item` |
| **Clienti** | Numero clienti da sincronizzare — **solo** se `plan.customersSyncEnabled === true` (Pro+) |

Il conteggio "pronti"/"con problemi" è calcolato **a livello di variante** (ogni riga
sincronizzata su `products` è una variante o un prodotto senza varianti). `cost_per_item`
vive sull'`InventoryItem` di Shopify e richiede lo scope `read_cost` (già presente).

### Caricamento (live, non bloccante)

- Il `loader` della dashboard **non** esegue la scansione: la pagina si apre immediatamente
  con le StatsCard in stato **skeleton/loading**.
- Al mount, un `useFetcher` chiama una **resource route** `GET /api/stats/products` che:
  1. Pagina i prodotti da Shopify REST API.
  2. Recupera il `cost` degli `InventoryItem` collegati.
  3. Ritorna `{ totalProducts, readyCount, problemCount, customerCount? }`.
- Le card si popolano quando il fetch completa. Il conteggio procede in background:
  la navigazione nella dashboard resta reattiva.
- La card **Clienti** è renderizzata solo se il piano abilita il sync clienti.

> Nota performance: su cataloghi grandi la scansione può essere lunga e consumare
> rate-limit Shopify. Accettato per questa iterazione (scelta esplicita: dati sempre
> accurati). Una cache verrà valutata in seguito se necessario.

---

## 4. Stepper — stati e comportamento

### Step 1 · "Collega Supabase"

- **Titolo:** "Collega Supabase"
- **Descrizione:** breve testo che spiega che serve un progetto Supabase del merchant
  per ricevere i dati sincronizzati.
- **Stato iniziale:** esteso/attivo (icona →), con pulsante **"Collega Supabase"**
  (non full-width) che porta a `/settings/supabase`.
- **Completamento:** quando la connessione è **verificata con successo** (§4.3), lo step
  si collassa (icona ✓) e si apre lo Step 2.
- **Recovery (fallback):** se il test di connessione fallisce, lo Step 1 **resta aperto**
  con un **Banner rosso** `tone="critical"` che riporta il messaggio d'errore preciso;
  l'utente può riprovare.

### Step 2 · "Sincronizza prodotti" / "Sincronizza prodotti e clienti"

- **Titolo dinamico:**
  - `plan.customersSyncEnabled === false` → **"Sincronizza prodotti"**
  - `plan.customersSyncEnabled === true` (Pro+) → **"Sincronizza prodotti e clienti"**
- **Stato bloccato:** finché Supabase non è connesso davvero, lo step è grigio/disabilitato
  (icona ⊘) con nota che spiega perché è bloccato.
- **Preview statico** (una volta sbloccato): testo del tipo
  *"Sincronizzerai N prodotti da Shopify → tabella `products` su Supabase"* (per Pro+ anche
  la riga clienti → tabella `customers`). N proviene dai conteggi §3.
- **Azione:** pulsante **"Avvia sincronizzazione"** (non full-width) che accoda il job
  di sync manuale (comportamento attuale dell'`action` di `_index.tsx`).

### 4.3 Definizione di "Supabase connesso realmente"

Aggiunta **una** colonna allo schema:

- `SupabaseConfig.connectionVerifiedAt : DateTime?` (`@map("connection_verified_at")`).

Valorizzata (`now()`) quando **test-connection** o **create-tables** vanno a buon fine;
azzerata a `null` se una verifica successiva fallisce. Lo **Step 2 si sblocca** se e solo se
`connectionVerifiedAt != null`. Serve una migrazione Prisma + `ALTER TABLE` corrispondente
nel database metadata.

---

## 5. Pulsanti — larghezza e allineamento

### Regola generale (tutta l'app)

I `Button` si dimensionano al **contenuto**: rimuovere `fullWidth` e i `size="large"` che
allargano indebitamente. Nessun pulsante deve occupare l'intera riga.

### Impostazioni (`app/routes/settings.supabase.tsx`)

I pulsanti d'azione (**Save Configuration**, **Test Connection**, **Create Tables**) vanno
**a destra, impilati in colonna**, ciascuno largo quanto il suo testo, occupando solo lo
spazio verticale necessario. Pattern: un `InlineStack align="end"` che contiene un
`BlockStack` verticale di bottoni. I Banner di esito (test/create) restano associati al
rispettivo blocco.

---

## 6. Gestione errori — niente più "Application Error" bianco

Oggi, quando qualcosa va storto, dentro l'iframe dell'app compare **solo** il testo
"Application Error" e un banner vuoto: sparisce tutto il resto dell'interfaccia.
Obiettivo: **il resto dell'app deve continuare a comparire** — il frame embedded
(`AppProvider`, `NavMenu`, titolo di pagina, stile Polaris) resta renderizzato — con un
**Banner rosso** che spiega con precisione il problema, al posto della schermata spoglia.

Aggiungere/estendere un `ErrorBoundary` Remix a livello **root** (`app/root.tsx`) e, dove
utile, per singola rotta, che renderizza:

- il guscio embedded dell'app (Polaris `AppProvider` + `NavMenu` + `Page` con titolo),
- un **Banner `tone="critical"`** con il messaggio d'errore **preciso**:
  - se `isRouteErrorResponse(error)` → `status` + `statusText` + eventuale `data`;
  - altrimenti → `error.message` (e `stack` solo in sviluppo).

Così l'utente vede l'app "normale" con l'errore evidenziato in rosso, non una pagina vuota.
L'app resta navigabile per quanto possibile.

---

## 7. File coinvolti

| File | Modifica |
|---|---|
| `app/routes/_index.tsx` | Nuovo layout: StatsCard rinnovate + Stepper; ActivityLog condizionato allo Step 2 |
| `app/routes/api.stats.products.tsx` (nuovo) | Resource route: scansione Shopify → conteggi totali/pronti/problemi/clienti |
| `app/components/Dashboard/Stepper.tsx` (nuovo) | Componente stepper verticale (stati ✓/→/⊘, collapse/expand) |
| `app/components/Dashboard/StatsCard.tsx` | Adattato per stato loading/skeleton e toni |
| `app/routes/settings.supabase.tsx` | Pulsanti a destra in colonna; valorizzazione `connectionVerifiedAt` su test/create ok |
| `app/routes/api.supabase.test-connection.tsx` | Set/reset `connectionVerifiedAt` in base all'esito |
| `app/routes/api.supabase.create-tables.tsx` | Set `connectionVerifiedAt` su successo |
| `app/root.tsx` | `ErrorBoundary` con guscio Polaris + Banner rosso |
| `prisma/schema.prisma` + migrazione | Nuovo campo `connectionVerifiedAt` |

---

## 8. Strategia di test

- **Unit:** logica di classificazione prodotto (pronto vs con problemi) sul campo
  `cost_per_item`; titolo dinamico Step 2 in base a `customersSyncEnabled`; gating dello
  Step 2 su `connectionVerifiedAt`.
- **Integrazione:** `GET /api/stats/products` con catalogo mock (prodotti con/senza costo);
  flusso test-connection → set `connectionVerifiedAt` → Step 2 sbloccato.
- **UI/manuale:** stepper (collapse/expand, stato bloccato), StatsCard skeleton→popolate,
  pulsanti non full-width, Impostazioni con pulsanti a destra, ErrorBoundary che mostra
  il banner rosso invece della pagina bianca.

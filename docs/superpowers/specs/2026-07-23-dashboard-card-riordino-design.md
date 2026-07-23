# Riordino delle card superiori della dashboard

**Data:** 2026-07-23
**Stato:** design approvato, pronto per il piano

## Obiettivo

Sostituire le quattro `StatsCard` affiancate in cima alla dashboard con **tre
macro card sulla stessa riga**: Account (sinistra), Prodotti (centro), Clienti
(destra). Ogni card presenta righe etichetta + badge, invece di un singolo numero
grande.

## Layout

Una riga sola: `InlineGrid columns={{ xs: 1, md: 3 }} gap="400"`, che rimpiazza
l'attuale `InlineGrid columns={{ xs: 1, sm: 2, md: 4 }}` in `app/routes/_index.tsx`
(righe ~407-459). `PlanBanner`, `Stepper` e `ActivityLog` restano invariati.

## Unità di conteggio dei prodotti

I tre numeri della card Prodotti contano **varianti**, non prodotti, perché è
l'unità reale del sistema: l'idoneità è per-variante e la sync scrive una riga per
variante. Coerenza garantita: `idonei + non idonei = totale`.

Nessun prodotto sfugge al conteggio: in Shopify ogni prodotto ha **sempre almeno
una variante** (i prodotti semplici ne hanno una con titolo `Default Title`, dove
vivono prezzo, SKU e l'`inventory_item` da cui deriva `cost_per_item`). Un prodotto
semplice conta quindi esattamente 1.

**Etichette:** restano "Prodotti totali" / "Prodotti idonei" / "Non idonei" —
scelta deliberata: il merchant ragiona per prodotti, e per un catalogo di soli
prodotti semplici i numeri coincidono col numero di prodotti.

## Card 1 (sinistra) — "Account"

| Riga | Badge |
|---|---|
| Database | grigio "Non collegato" / **verde** "Collegato" |
| Piano | grigio: Free / Pro+ / Business / Enterprise / Lifetime |
| Frequenza sync | grigio: "Ogni &lt;intervallo&gt;" |

- **Database** deriva da `supabaseConnected` (già nel loader: `!!shop.supabaseConfig?.connectionVerifiedAt`).
- **Piano** deriva da `shop.currentPlan` con mappatura esplicita:
  `free → Free`, `pro → Pro+`, `business → Business`, `enterprise → Enterprise`,
  `lifetime → Lifetime`. Un valore non previsto ricade su Capitalize del nome.
- **Frequenza sync** deriva da `Plan.maxSyncFrequencyHours` (Float):
  `1 → "Ogni ora"`, `24 → "Ogni 24 ore"`, `0.5 → "Ogni 30 minuti"`,
  `n < 1 → "Ogni <n*60> minuti"`, altrimenti `"Ogni <n> ore"`.

## Card 2 (centro) — "Prodotti"

| Riga | Badge | Note |
|---|---|---|
| Prodotti totali | grigio | `readyCount + problemCount` |
| Prodotti idonei | **verde** | `readyCount` |
| Non idonei | **arancione** se > 0, **grigio** se = 0 | `problemCount` |

Sulla riga "Non idonei", in una colonna propria **tra l'etichetta e il badge**, un
link **"Vedi prodotti"** che naviga a `/products/issues`. Se `problemCount === 0`
il link **non viene renderizzato** e il badge è grigio.

**Fonte dati:** l'endpoint `/api/stats/products` viene esteso con `totalVariants`
(= `readyCount + problemCount`), così il contratto è esplicito e la UI non fa
aritmetica. Il campo `totalProducts` esistente resta invariato (lo usa `PlanBanner`).

## Card 3 (destra) — "Clienti"

### Piano senza sync clienti (`customersSyncEnabled === false`)

Le righe reali vengono renderizzate ma coperte da un **overlay chiaro in
gradiente**: opacità 40% in alto (prime due righe intraviste) fino a completamente
opaco in basso. Al centro dell'overlay il pulsante **"Aggiorna piano"**.

- Il pulsante resta **`disabled` con Tooltip "Presto disponibile"** finché il
  Billing in-app non esiste (è il blocco successivo pianificato).
- Il contenuto sotto l'overlay è `aria-hidden` e con `pointer-events: none`: non
  deve essere raggiungibile da tastiera né letto dagli screen reader, perché
  mostra numeri che l'utente non ha diritto di vedere.

### Piano con sync clienti attiva

| Riga | Badge | Icona info |
|---|---|---|
| Clienti totali | grigio | — |
| Clienti opt-in | **verde** | "Qui vengono identificati i clienti che hanno acconsentito al marketing" |
| Clienti opt-out | grigio | "Qui vengono identificati i clienti che non hanno acconsentito al marketing" |

**Fonte dati:** nuovo endpoint `/api/stats/customers` che pagina i clienti via
Admin API e conta il consenso **in tempo reale**. Il consenso si determina come in
`transformCustomer`: `email_marketing_consent.state === 'subscribed'`, con fallback
al campo legacy `accepts_marketing`.

Poiché la paginazione completa è costosa, l'endpoint riusa lo **schema** già
adottato per la readiness prodotti: risposta immediata dalla cache e ricalcolo live
in background innescato dal client quando la risposta è marcata `cached`.

`app/lib/cache/stats-cache.server.ts` espone oggi funzioni specifiche per la
readiness (`getReadinessCache` / `setReadinessCache` sul tipo `ReadinessStats`):
servono quindi **funzioni analoghe dedicate ai clienti**, con chiave di cache
propria e tipo proprio (`getCustomerStatsCache` / `setCustomerStatsCache`), nello
stesso modulo e con la stessa gestione degli errori. Se Redis non è disponibile il
fallback è il calcolo diretto (gli errori di cache sono già ignorati per design,
come si vede dai log `[stats-cache] get fallito (ignoro, calcolo live)`).

## Struttura dei componenti

Per non piegare `StatsCard` (che ha una forma diversa: un numero grande) si
introduce una primitiva riutilizzabile e tre card che la usano:

- `app/components/Dashboard/MetricRow.tsx` — una riga: etichetta, slot centrale
  opzionale (azione), badge. Props: `label`, `badge: { tone, content }`,
  `info?: string`, `action?: ReactNode`.
- `app/components/Dashboard/AccountCard.tsx`
- `app/components/Dashboard/ProductsCard.tsx`
- `app/components/Dashboard/CustomersCard.tsx` (incluso l'overlay bloccato)

Le funzioni pure di formattazione vivono separate e testabili:
`app/components/Dashboard/account-format.ts` con `planLabel(planName)` e
`syncFrequencyLabel(hours)`.

Il conteggio del consenso vive in `app/lib/stats/customer-consent-stats.ts` con
`countMarketingConsent(customers)` → `{ optIn, optOut }`, pura e testabile.

## Fuori scope

- Billing in-app (il pulsante "Aggiorna piano" resta disabilitato).
- Modifiche a `PlanBanner`, `Stepper`, `ActivityLog`.
- Modifiche alla sincronizzazione o al proxy.

## Test

Vitest, coerente con la suite esistente:

- `planLabel`: i cinque piani noti + un valore ignoto.
- `syncFrequencyLabel`: 1 → "Ogni ora"; 24 → "Ogni 24 ore"; 0.5 → "Ogni 30 minuti".
- `countMarketingConsent`: consenso nidificato `subscribed` → optIn; `unsubscribed`
  e `pending` → optOut; fallback legacy `accepts_marketing: true` → optIn; array
  vuoto → zeri.
- `/api/stats/customers`: risponde con i conteggi; usa la cache quando presente.
- Card Prodotti: con `problemCount > 0` il link "Vedi prodotti" è presente e il
  badge è arancione; con `problemCount === 0` il link è assente e il badge grigio.
- Card Clienti bloccata: il pulsante "Aggiorna piano" è presente e disabilitato, e
  il contenuto sottostante è `aria-hidden`.

## Criteri di completamento

- Tre card sulla stessa riga, con i contenuti e i colori descritti.
- `idonei + non idonei = totale` in ogni caso.
- Link "Vedi prodotti" presente solo quando ci sono non idonei.
- `npm test`, `npx tsc --noEmit` e `npm run build` verdi.

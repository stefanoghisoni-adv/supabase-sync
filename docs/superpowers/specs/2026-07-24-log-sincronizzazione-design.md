# Log di sincronizzazione e riordino dello Stepper

**Data:** 2026-07-24
**Stato:** design approvato, pronto per il piano

## Obiettivo

Due interventi sulla dashboard, sotto le tre card superiori:

1. **Layout:** lo Stepper (passi "1. Collega Supabase" e "2. Sincronizza prodotti"
   / "2. Sincronizza prodotti e clienti") passa a **metà larghezza a sinistra**; a
   destra, sulla stessa riga, il **Log di sincronizzazione**.
2. **Log:** il componente attuale `ActivityLog` viene riscritto con **tre colonne**
   e arricchito con un nuovo tipo di evento per la **creazione delle tabelle**.

## Parte 1 — Layout

Una riga `InlineGrid columns={{ xs: 1, md: 2 }} gap="400"`: Stepper a sinistra,
log a destra. Sostituisce l'attuale `<Stepper />` a piena larghezza e la
`<Layout.Section>` che ospita `ActivityLog` più in basso.

## Parte 2 — Log di sincronizzazione

### Colonne

| # | Colonna | Contenuto |
|---|---|---|
| 1 | Stato | Badge |
| 2 | Data/ora | Giorno e ora dell'evento; per le sync anche la durata |
| 3 | Numeri | Varianti idonee e clienti; **vuota** per la creazione tabelle |

### Famiglia A — Creazione tabelle

Tre nuovi valori di `SyncJob.jobType`, che codificano **cosa è stato davvero
creato** (nessuna colonna nuova, quindi nessuna migrazione):

| jobType | Testo del badge (tone `success`) |
|---|---|
| `table_create_products` | Creazione tabella prodotti riuscita |
| `table_create_customers` | Creazione tabella clienti riuscita |
| `table_create_both` | Creazione tabelle prodotti e clienti riuscita |

Terza colonna vuota. La riga viene registrata **solo se almeno una tabella è stata
effettivamente creata**: se esistevano già entrambe, nessun evento.

### Famiglia B — Sincronizzazione

I `jobType` esistenti (`initial_bulk`, `periodic_check`, `webhook`), indipendenti
dalle tabelle.

- **Badge** dallo stato, in italiano: `completed` → "Completata" (`success`),
  `failed` → "Fallita" (`critical`), `running` → "In corso" (`info`).
- **Colonna 2:** data e ora di esecuzione più la durata, calcolata da
  `completedAt - startedAt` (assente finché il job è in corso).
- **Colonna 3:** numero di **varianti idonee** (`variantsSynced`) e, **solo se il
  piano include i clienti**, il numero di clienti sincronizzati
  (`customersSynced`).

I numeri stanno **solo** nella terza colonna: la descrizione non li ripete.

Per i job falliti resta visibile il messaggio d'errore già presente oggi.

## Come si rileva quali tabelle sono state create

`buildMerchantSchemaSQL` usa `CREATE TABLE IF NOT EXISTS`: è idempotente e non
riporta nulla. Per distinguere i tre casi serve un **controllo preventivo**.

In `app/routes/api.supabase.select-project.tsx`, **prima** della DDL, si
interroga lo schema del merchant via `runQuery`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('products', 'customers');
```

I nomi sono letterali `products` / `customers` perché è esattamente ciò che la DDL
crea (`buildTableSQL` li scrive hardcoded); i campi configurabili
`tableNameProducts` / `tableNameCustomers` servono al percorso di lettura/scrittura
della sync, non alla DDL.

Dopo la DDL: `create = attese − preesistenti`, dove *attese* è `['products']`
oppure `['products', 'customers']` a seconda di `Plan.customersSyncEnabled`.
Il `jobType` si deriva da `create`; se è vuoto non si registra nulla.

**Best effort:** la registrazione del log non deve mai far fallire il
collegamento. Va in un `try/catch` con `console.warn`, esattamente come già fa
l'emissione del token-proxy nella stessa route.

## Traduzione del componente

`ActivityLog` è oggi in inglese ("Recent Activity", "No sync activity yet",
"3 products, 8 variants"), incoerente col resto dell'interfaccia. Viene riscritto
in italiano e rinominato **"Log di sincronizzazione"**.

## Struttura

- `app/components/Dashboard/SyncLog.tsx` — il componente a tre colonne (sostituisce
  `ActivityLog.tsx`, che viene rimosso).
- `app/components/Dashboard/sync-log-format.ts` — funzioni pure e testabili:
  - `tableCreationMessage(jobType: string): string | null`
  - `syncStatusBadge(status: string): { tone: 'success' | 'critical' | 'info'; label: string }`
  - `formatDuration(startedAt: string, completedAt: string | null): string | null`
  - `syncRowNumbers(job, customersEnabled: boolean): string`
- `app/lib/supabase/detect-created-tables.ts` — `detectCreatedTables(existing: string[], includeCustomers: boolean): string[]` e `tableCreationJobType(created: string[]): string | null`, pure.

## Fuori scope

- **Nessuno storico ricostruito:** per i collegamenti già avvenuti non verranno
  create righe di creazione tabelle (deciso esplicitamente).
- **`api.supabase.create-tables.tsx`** (percorso legacy) non registra l'evento:
  il flusso corrente passa da `select-project`. Scelta consapevole per non
  allargare lo scope; se quel percorso resta in uso andrà allineato a parte.
- Nessuna modifica a `PlanBanner` né alle tre card superiori.

## Test

Vitest. Il progetto **non ha infrastruttura per test di componenti React**
(nessun jsdom/testing-library): non va aggiunta. La logica sta in funzioni pure:

- `tableCreationMessage`: i tre jobType → i tre messaggi esatti; un jobType di
  sync → `null`.
- `syncStatusBadge`: completed/failed/running → tone e label italiane attese.
- `formatDuration`: durata assente se `completedAt` è `null`; formattazione di
  secondi e di durate sotto il secondo.
- `syncRowNumbers`: con piano senza clienti mostra solo le varianti; con clienti
  mostra entrambi; job di creazione tabella → stringa vuota.
- `detectCreatedTables`: nessuna preesistente + clienti inclusi → entrambe;
  `products` già presente + clienti inclusi → solo `customers`; entrambe già
  presenti → vuoto.
- `tableCreationJobType`: le tre combinazioni → i tre jobType; vuoto → `null`.

## Criteri di completamento

- Stepper a metà larghezza a sinistra, log a destra sulla stessa riga.
- Log a tre colonne, in italiano, con i badge e i testi indicati.
- Un ricollegamento che crea tabelle produce la riga corretta fra le tre.
- `npm test`, `npx tsc --noEmit` e `npm run build` verdi.

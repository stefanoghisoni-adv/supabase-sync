# Sblocco della sync dopo l'upgrade di piano

**Data:** 2026-07-24
**Stato:** design approvato, pronto per il piano

## Obiettivo

Quando il piano di un negozio passa a uno superiore — che alza il tetto prodotti
e/o sblocca i clienti — la dashboard deve:

1. **riabilitare il pulsante di sincronizzazione**, oggi disabilitato per sempre
   dopo la prima sync completata;
2. mostrare l'etichetta **`Sincronizza clienti`** quando il nuovo piano include i
   clienti;
3. mostrare **una sola volta** un banner verde che annuncia la nuova tabella
   clienti e il nuovo tetto prodotti.

## L'azione NON cambia

`processInitialBulkSync` sincronizza già i prodotti fino al tetto del **piano
corrente** e poi, `if (plan?.customersSyncEnabled)`, i clienti. Da quando è
riconciliativo (non azzera più), rilanciarlo dopo un upgrade fa esattamente ciò
che serve: recupera i prodotti che il vecchio tetto aveva escluso **e** popola i
clienti.

Non serve quindi alcun nuovo processore né un percorso di sync dedicato: il
pulsante continua a innescare la stessa azione. Cambiano solo **quando è
abilitato** e **come si chiama**.

## Come si rileva l'upgrade

Serve un segnale persistente: il piano con cui è stata eseguita l'ultima sync.

Nuovo campo su `Shop`:

- `lastSyncedPlan String?` → colonna `last_synced_plan`

Viene scritto (`= shop.currentPlan`) al **completamento** di
`processInitialBulkSync`. Il confronto è allora immediato:

```
planChanged = lastSyncedPlan != null && currentPlan !== lastSyncedPlan
```

- `lastSyncedPlan` **null** → nessuna sync completata: flusso normale, nessun
  upgrade da segnalare.
- **Downgrade**: il confronto scatta anche al ribasso. È **desiderabile**: un
  nuovo bulk applica il tetto più basso e la spazzata rimuove l'eccedenza.

## Stato del pulsante

Oggi: `syncDisabled = blocked || inProgress || syncCompleted`.

Diventa:

```
syncDisabled = blocked || inProgress || (syncCompleted && !planChanged)
```

Cioè: a sync completata il pulsante resta disabilitato **finché il piano non
cambia**. Al cambio torna disponibile, e dopo la nuova sync `lastSyncedPlan` si
riallinea e il pulsante si ridisabilita da solo.

## Etichetta del pulsante

- `planChanged && customersEnabled` → **`Sincronizza clienti`**
- altrimenti → logica attuale (`Sincronizza prodotti` /
  `Sincronizza prodotti e clienti`)

Nota deliberata: l'etichetta dice "clienti" ma l'azione recupera anche i prodotti
oltre il vecchio tetto. È la scelta dell'owner: l'etichetta comunica il beneficio
principale dell'upgrade.

## Banner di upgrade

**Quando compare:** al cambio di piano (`currentPlan !== lastSyncedPlan`), la prima
volta in assoluto che quel cambio viene visto.

**Ciclo di vita**, come richiesto dall'owner:

| Momento | Comportamento |
|---|---|
| Primi 2 minuti | visibile e **non chiudibile** (nessuna X) |
| Dopo 2 minuti | compare la X, il merchant può chiuderlo |
| Navigazione fra tab dell'app | **resta vivo** |
| App o Shopify chiusi | **non riappare mai più** |

Le ultime due voci richiedono **due meccanismi distinti**, perché nessuno dei due
da solo le soddisfa entrambe:

- **`sessionStorage`** — sopravvive alla navigazione fra tab (è la stessa iframe,
  navigazione client-side) ma muore alla chiusura della scheda. Tiene il banner in
  vita durante la sessione e ne memorizza l'istante di comparsa per i 2 minuti.
- **Flag persistente su `Shop`** — `planBannerShownAt DateTime?` (colonna
  `plan_banner_shown_at`), scritto **dal loader al primo render** che lo mostra.
  Garantisce che alla riapertura dell'app non torni.

Col solo `sessionStorage` il banner tornerebbe a ogni riapertura; col solo flag
persistente sparirebbe già cambiando tab.

Compare una sola volta nella vita del negozio: un secondo cambio di piano non lo
ripropone.

**Contenuto** (`Banner tone="success"`, con `onDismiss`):

- Titolo: `Piano aggiornato`
- Corpo, con la parte clienti solo se il piano li include:
  > Ora è disponibile una nuova tabella per i clienti che hanno acconsentito al marketing, e il limite di prodotti sincronizzabili è stato innalzato a **N**.
- Se `maxProducts` è `null` (illimitato), al posto del numero: `senza limite`.
- Se il piano non include i clienti, resta solo la parte sul limite prodotti.

Posizione: in cima alla dashboard, sopra le card.

## Modifiche allo schema

Due colonne nullable su `shops`. Come per `iana_timezone`, il pooler non esegue
DDL: **lo SQL va lanciato a mano PRIMA del deploy**, altrimenti Prisma le
selezionerebbe in ogni query su `shops` facendole fallire tutte.

```sql
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "last_synced_plan" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "plan_banner_shown_at" TIMESTAMP;
```

## Fuori scope

- **Billing in-app**: non esiste. Finché non c'è, `currentPlan` cambia solo per
  intervento manuale dell'owner sul database. Il meccanismo reagisce comunque al
  cambio, da qualunque origine provenga.
- Nessuna modifica alla logica di sincronizzazione, al proxy, alla tab Logs.
- `PlanBanner` resta com'è (mostra il consumo su `counts.totalProducts`, che
  conta i prodotti a catalogo e non quelli idonei: incoerenza nota, segnalata
  separatamente, non affrontata qui).

## Test

Vitest. Il progetto non ha infrastruttura per test di componenti React: la logica
va quindi in funzioni pure testabili.

Nuovo modulo `app/components/Dashboard/plan-upgrade.ts`:

- `hasPlanChanged(currentPlan, lastSyncedPlan)`: null → `false`; uguali → `false`;
  diversi → `true`.
- `syncButtonLabel({ planChanged, customersEnabled })`: i tre esiti attesi.
- `upgradeBannerText({ customersEnabled, maxProducts })`: con clienti e tetto
  numerico; senza clienti; con `maxProducts` null → `senza limite`.

Più la verifica che `processInitialBulkSync` scriva `lastSyncedPlan` a
completamento (test nel file esistente `bulk-sync.test.ts`).

## Criteri di completamento

- Dopo un cambio di `currentPlan`, il pulsante torna abilitato e — se il piano
  include i clienti — si chiama `Sincronizza clienti`.
- Completata la nuova sync, il pulsante si ridisabilita da solo.
- Il banner compare una sola volta, è chiudibile e non riappare al ricaricamento.
- `npm test`, `npx tsc --noEmit`, `npm run build` verdi.

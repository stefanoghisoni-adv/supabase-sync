# Idoneità prodotti nella sync (sotto-progetto A)

**Data:** 2026-07-23
**Stato:** design approvato, pronto per il piano di implementazione

## Obiettivo

La sincronizzazione verso Supabase deve scrivere **solo le varianti prodotto
idonee**, non l'intero catalogo. Oggi tutti i percorsi di scrittura upsertano
ogni variante; questo sotto-progetto introduce un filtro di idoneità applicato in
modo uniforme a tutti i percorsi, più la pulizia dei residui.

Il consenso clienti è un problema separato (enforcement lato proxy in lettura) ed
è coperto dal **sotto-progetto B**, non qui.

## Definizione di idoneità

Una variante/riga prodotto è **idonea** se ha il costo del venduto valorizzato:

```
isProductRowEligible(row) === (row.cost_per_item !== null)
```

- Il filtro opera sulla **riga trasformata** (`SupabaseProductRow`), dove
  `cost_per_item` è già `number | null`. Vale sia per le righe variante
  (`is_variant: true`) sia per la riga singola dei prodotti a variante unica.
- Un costo esplicito di `0` è idoneo (`cost_per_item === 0`, non `null`) —
  coerente con `isVariantReady` esistente in `app/lib/stats/product-readiness.ts`,
  che considera pronto anche `"0.00"`.
- Granularità **per-variante**: dentro lo stesso prodotto si scrivono le varianti
  idonee e si scartano le non idonee.

## Vincolo: il costo vive sull'InventoryItem

`cost_per_item` NON è nel payload del prodotto (né API prodotti né webhook): vive
sull'InventoryItem. La sync bulk/periodica lo popola con
`enrichVariantCosts(client, products)` prima di trasformare. Qualsiasi percorso
che filtra per costo **deve** prima arricchire il costo, altrimenti la variante
risulterebbe erroneamente non idonea.

## Modulo centrale

Nuovo modulo (funzioni pure, testabili in isolamento), es.
`app/lib/eligibility/product-eligibility.ts`:

- `isProductRowEligible(row: SupabaseProductRow): boolean` → `row.cost_per_item !== null`
- `filterEligibleProductRows(rows: SupabaseProductRow[]): SupabaseProductRow[]`

Usato da **tutti** i percorsi di scrittura sotto. Nessun percorso può scrivere
senza passare dal filtro, altrimenti rientrerebbero righe non idonee.

## Percorsi di scrittura da modificare

### 1. Bulk / manuale — `processInitialBulkSync` (`app/lib/workers/processors.server.ts`)

- Il bulk **azzera** già la tabella prodotti (`delete().gte('shopify_product_id', 0)`)
  e la ripopola da zero.
- Cambio: dopo `transformProduct` + `enrichVariantCosts`, filtrare le righe con
  `filterEligibleProductRows` prima di accumularle in `allRows`.
- **Effetto backfill automatico:** poiché la tabella viene svuotata e ripopolata
  solo con righe idonee, un singolo sync manuale ripulisce tutti i residui non
  idonei pre-esistenti. Nessuna migrazione o delete separato necessari.
- `processManualSync` riusa `processInitialBulkSync` → coperto automaticamente.

### 2. Periodica — `processPeriodicSyncCheck` (`app/lib/workers/processors.server.ts`)

- Dopo `transformProduct(product)`, calcolare `eligibleRows = filterEligibleProductRows(...)`.
- `currentVariantIds` deve derivare da **eligibleRows** (non da tutte le righe):
  così una variante che perde il costo non è più in `currentVariantIds` → viene
  cancellata dal blocco di riconciliazione orfani già presente.
- Upsertare `eligibleRows` invece di `currentRows`.
- Se `eligibleRows` è vuoto (prodotto senza alcuna variante idonea): non fare
  upsert, ma comunque eseguire la riconciliazione che rimuove le eventuali righe
  esistenti di quel prodotto; non contarlo verso il tetto del piano.

### 3. Webhook prodotto — `webhooks.products.create.tsx` (usato anche da `products.update`)

- **Aggiungere `enrichVariantCosts(shopifyClient, [product])`** prima di
  `transformProduct`. Richiede un client Shopify autenticato nel webhook (oggi il
  webhook non ne istanzia uno): va costruito da `shop.accessToken` come negli
  altri percorsi. Questo sistema anche il bug latente per cui un `products/update`
  scrive `cost_per_item = null` azzerando il costo.
- Dopo il transform, filtrare con `filterEligibleProductRows`.
- La riconciliazione già presente (delete delle righe con variant_id non più nel
  payload) rimuove le varianti diventate non idonee, perché non saranno tra le
  righe idonee upsertate.
- Se dopo il filtro non resta alcuna riga idonea: nessun upsert, ma la
  riconciliazione rimuove le righe esistenti del prodotto.

### 4. Tetto per piano — interazione con `limitProducts` / `isProductLimitReached`

- Regola: "prima filtri gli idonei, poi applichi il tetto". Un prodotto conta
  verso `maxProducts` **solo se ha ≥1 variante idonea**.
- Nel bulk, il conteggio `totalProducts` (usato da `limitProducts` e
  `isProductLimitReached`) va incrementato solo per i prodotti con almeno una
  riga idonea. Un prodotto con zero righe idonee non consuma quota.
- Nella periodica, la stessa regola vale per l'inserimento di `product.id` in
  `existingProductIds`.

## Fuori scope

- Consenso clienti in lettura → sotto-progetto B (proxy).
- Nessun cambiamento allo schema DB (le colonne esistono già).
- Nessun cambiamento ai webhook `products.delete` / `customers.*`.

## Test

Vitest, coerente con la suite esistente (160 test). Nuovi test:

- **Modulo idoneità:** `cost_per_item` null → non idoneo; `0` → idoneo; numero
  positivo → idoneo; `filterEligibleProductRows` scarta solo le non idonee.
- **Bulk:** un batch misto (varianti con e senza costo) → upsert solo delle
  idonee; un prodotto senza varianti idonee → nessuna riga e nessun consumo di
  quota.
- **Periodica:** variante che perde il costo → finisce tra gli orfani e viene
  cancellata; prodotto che diventa interamente non idoneo → sue righe rimosse.
- **Webhook prodotto:** con costo arricchito, upsert delle idonee; senza righe
  idonee, rimozione delle esistenti. Verificare che `enrichVariantCosts` sia
  invocato.
- **Tetto piano:** i prodotti senza varianti idonee non consumano `maxProducts`.

## Criteri di completamento

- Tutti i percorsi di scrittura prodotti filtrano tramite il modulo centrale.
- Un sync manuale su uno store con residui non idonei lascia in tabella solo le
  varianti con costo.
- `npm test` verde e `npm run build` verde.

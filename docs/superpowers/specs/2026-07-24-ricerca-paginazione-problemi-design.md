# Ricerca e paginazione in "Prodotti con problemi"

**Data:** 2026-07-24
**Stato:** design approvato, pronto per il piano

## Obiettivo

Quattro interventi sulla pagina `products.issues`:

1. **Barra di ricerca** nella tabella: filtra per titolo prodotto, variante, SKU,
   ID prodotto e prezzo.
2. **Paginazione a 20 righe** con frecce avanti/indietro (disabilitate ai bordi) e
   indicatore della pagina corrente.
3. **Colonna Prezzo**, oggi assente.
4. Pulsante **"Ricontrolla e aggiorna"** in linea con il titolo della pagina.

Il difetto dei badge nel log (larghi quanto la cella invece che quanto il testo)
è già stato corretto a parte.

## 1. Il prezzo va aggiunto ai dati

`ProblemVariant` contiene oggi `productId`, `productTitle`, `variantId`,
`variantTitle`, `sku`, `inventoryItemId`, `missingField`: **nessun prezzo**.

Il payload di Shopify lo espone già (il loader chiede `fields: 'id,title,variants'`
e la variante include `price`), quindi va solo propagato:

- `ProblemVariant` guadagna `price: string | null`.
- `collectProblemVariants` lo valorizza da `variant.price`.
- La tabella guadagna una colonna **Prezzo** (sei colonne invece di cinque).

Il prezzo resta una **stringa**: è ciò che Shopify restituisce, e la ricerca lo
confronta come testo. Convertirlo in numero non aggiungerebbe nulla e
introdurrebbe problemi di arrotondamento.

## 2. Ricerca

Un `TextField` di tipo ricerca sopra la tabella, dentro la stessa Card.

**Campi cercati**, in OR: `productTitle`, `variantTitle`, `sku`, `productId`,
`price`. Confronto **case-insensitive** per sottostringa; `productId` e `price`
vengono confrontati come testo, così "123" trova sia l'ID 1234 sia il prezzo
12.30 — comportamento voluto, la ricerca è uno strumento di scrematura.

Una query vuota (o di soli spazi) non filtra nulla.

## 3. Paginazione

**20 righe per pagina**, applicata alle righe **già filtrate** dalla ricerca.

Componente Polaris `Pagination` sotto la tabella:

- `hasPrevious` falso alla prima pagina, `hasNext` falso all'ultima: le frecce si
  disabilitano da sole.
- `label` con la posizione corrente, es. `Pagina 2 di 5`.

**Cambiando la ricerca si torna a pagina 1**: restare a pagina 4 su un risultato
di 2 pagine mostrerebbe una tabella vuota senza spiegazione.

Le righe risolte vengono già rimosse dall'elenco: se la rimozione svuota la pagina
corrente e non è la prima, si arretra di una pagina.

## 4. Pulsante nel titolo

"Ricontrolla e aggiorna" passa da dentro la Card a `primaryAction` di `Page`,
mantenendo stato `loading` e `disabled` attuali. Il testo descrittivo resta dov'è.

## Testo di riepilogo

Il conteggio sopra la tabella oggi dice "N varianti a cui manca il valore
cost_per_item". Con la ricerca attiva mostra le **righe corrispondenti**, non il
totale: è ciò che l'utente sta guardando.

## Struttura

Nuovo modulo puro `app/lib/stats/problem-filter.ts`:

- `filterProblemVariants(rows: ProblemVariant[], query: string): ProblemVariant[]`
- `pageCount(total: number, perPage: number): number`
- `pageSlice<T>(rows: T[], page: number, perPage: number): T[]`

La logica sta lì perché il progetto **non ha infrastruttura per test di componenti
React**: i componenti restano markup che consuma funzioni testate.

## Fuori scope

- Nessuna modifica al salvataggio del costo né a "Ricontrolla e aggiorna" (cambia
  solo dove sta il pulsante).
- Nessuna modifica alla dashboard, al proxy, alla sincronizzazione.
- Ricerca e paginazione sono **lato client**: le righe sono già tutte caricate dal
  loader. Nessuna nuova chiamata a Shopify.

## Test

Vitest, sul modulo puro e su `collectProblemVariants`:

- `collectProblemVariants` valorizza `price` dalla variante; `null` se assente.
- `filterProblemVariants`: query vuota → tutte le righe; match su titolo, su
  variante, su SKU, su ID prodotto, su prezzo; case-insensitive; nessun match →
  lista vuota; SKU `null` non fa esplodere il confronto.
- `pageCount`: 0 righe → 0; 20 → 1; 21 → 2.
- `pageSlice`: prima pagina, pagina centrale, ultima pagina parziale.

## Criteri di completamento

- Ricerca funzionante sui cinque campi, con la tabella che mostra al massimo 20
  righe per pagina.
- Frecce disabilitate correttamente ai bordi e indicatore di pagina visibile.
- Colonna Prezzo presente.
- "Ricontrolla e aggiorna" in linea col titolo della pagina.
- `npm test`, `npx tsc --noEmit`, `npm run build` verdi.

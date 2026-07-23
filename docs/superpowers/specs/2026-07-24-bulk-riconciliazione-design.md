# Bulk sync: riconciliazione invece di azzeramento

**Data:** 2026-07-24
**Stato:** design approvato, pronto per il piano

## Problema

`processInitialBulkSync` **azzera la tabella prodotti** prima di ripopolarla:

```ts
await supabase.from(tableNameProducts).delete().gte('shopify_product_id', 0);
```

Tre conseguenze:

1. **Finestra di dati vuoti.** Fra la cancellazione e il ripopolamento la tabella è
   vuota. Su un negozio vivo il tracciamento legge zero prodotti per tutta la
   durata della sync.
2. **Distruttivo su progetti già popolati.** Collegando un progetto Supabase
   esistente si cancella quanto c'è, incluse eventuali colonne valorizzate dal
   merchant sulle righe.
3. **Fragile in caso di errore.** Se la scansione di Shopify fallisce a metà, la
   tabella resta parzialmente popolata: l'azzeramento è già avvenuto.

## Obiettivo

Sostituire l'azzeramento con una **riconciliazione**: aggiornare e aggiungere le
varianti idonee, ed eliminare **solo** le righe che non devono più esserci, cioè:

- prodotti/varianti **non più presenti su Shopify**;
- varianti che **hanno perso il `cost_per_item`** (non più idonee).

## Meccanismo: marcatura e spazzata

1. Si annota `runStartedAt` (ISO) **prima** di iniziare la paginazione.
2. Si pagina Shopify e si fa upsert delle sole righe idonee, come già oggi. Ogni
   riga toccata riceve un `synced_at` fresco (lo imposta già `transformProduct`),
   necessariamente **successivo** a `runStartedAt`.
3. **Solo se la scansione è terminata regolarmente**, una singola cancellazione:

   ```
   DELETE FROM <products> WHERE synced_at < runStartedAt
   ```

Le righe non toccate dalla corsa sono esattamente le due categorie da eliminare.
Una query sola, indipendente dal numero di prodotti: non serve confrontare liste
di ID.

**L'abbinamento avviene per identità:** l'upsert usa `onConflict:
'shopify_variant_id'`, quindi ogni riga esistente viene riconosciuta e aggiornata
per ID variante; la spazzata rimuove quelle che nessun ID ha agganciato.

### Il guardrail che conta

La cancellazione avviene **esclusivamente dopo una scansione completa**. Se una
pagina fallisce, il bulk lancia (come già oggi) e la spazzata **non viene
eseguita**: meglio qualche riga obsoleta che perdere prodotti veri per un errore
di rete. È quindi **più sicuro dell'attuale**, dove un errore a metà lascia la
tabella mezza vuota.

Il raggiungimento del tetto del piano (`isProductLimitReached`) è invece una
terminazione **regolare**: la spazzata va eseguita, e il risultato coincide con
il comportamento odierno (in tabella restano i primi N idonei).

## Tipi e compatibilità

`synced_at` è `TIMESTAMP DEFAULT NOW()` (senza fuso) e Supabase gira in UTC; le
righe vengono scritte con `new Date().toISOString()`. Il confronto
`synced_at < runStartedAt` è quindi coerente perché entrambi i valori percorrono
la stessa strada.

Righe con `synced_at` **NULL** non vengono cancellate: in SQL un confronto con
NULL non è mai vero. Scelta deliberata e prudente — sono righe che l'app non ha
scritto, di cui non conosciamo l'origine.

## Cosa NON cambia

- **Clienti:** `syncCustomers` è già un upsert accumulativo senza alcuna
  cancellazione. Storico ordini e LTV restano intatti. **Nessuna modifica.**
- **Sync periodica:** lavora in delta e riconcilia già per prodotto; una variante
  che perde il costo compare nel delta e viene rimossa. Un prodotto cancellato su
  Shopify non può comparire in un delta ed è gestito dal webhook
  `products/delete`. **Nessuna modifica.**
- **Prodotti in bozza:** già sincronizzati. `getProducts` non applica alcun filtro
  di stato e l'idoneità dipende solo dal `cost_per_item`. **Nessuna modifica.**

## Limite noto

La paginazione a cursore di Shopify può, in rari casi, non restituire un prodotto
modificato durante la scansione (salto di pagina). Quel prodotto verrebbe
spazzato e riaggiunto alla sync successiva. Il rischio esiste **identico oggi**
con l'azzeramento — anzi peggiore, perché lì il prodotto sparirebbe comunque —
quindi non è una regressione.

## Test

Vitest (`app/lib/workers/bulk-sync.test.ts`), estendendo i mock già presenti:

- **Nessun azzeramento:** il bulk non esegue più la cancellazione totale
  (`gte('shopify_product_id', 0)`).
- **Spazzata dopo scansione completa:** al termine viene invocata una delete con
  filtro `lt` su `synced_at`.
- **Nessuna spazzata se la scansione fallisce:** se una pagina lancia, la delete
  non viene invocata e il job risulta `failed`.
- **Spazzata eseguita anche al raggiungimento del tetto del piano.**

## Criteri di completamento

- La tabella prodotti non viene mai svuotata: resta leggibile per tutta la sync.
- Dopo un bulk completo contiene esattamente le varianti idonee presenti su
  Shopify.
- Un errore a metà scansione non cancella nulla.
- `npm test`, `npx tsc --noEmit`, `npm run build` verdi.

# Consenso clienti nel proxy di lettura (sotto-progetto B)

**Data:** 2026-07-23
**Stato:** design approvato (brainstorming), pronto per il piano

## Obiettivo

I clienti vengono sincronizzati **tutti** su Supabase (consenzienti e non). L'uso
dei loro dati per il tracciamento deve però essere permesso **solo se il cliente
ha prestato il consenso al marketing**. L'enforcement vive interamente nel **proxy
di lettura** (`/rest/v1/customers`), non nella sync.

"Consenso" = `accepts_marketing === true` sulla riga Supabase (che il transformer
deriva da `email_marketing_consent.state === 'subscribed'`, con fallback al campo
legacy). Questo sotto-progetto NON tocca la sincronizzazione.

## Regole di enforcement (solo tabella `customers`)

Si applicano **dopo** i controlli già esistenti nel loader (token valido,
`canReadData`, allowlist tabella per piano, guardia embedding) e riguardano solo
`table === 'customers'`. La tabella `products` è invariata.

### 1. Lookup mirato → 403 se non consenziente

Una lettura è un **lookup mirato** se filtra con `eq` su una colonna
identificativa univoca: `email`, `phone`, `shopify_customer_id`
(es. `?email=eq.foo@bar.com`, `?shopify_customer_id=eq.123`).

Comportamento: il proxy verifica il consenso dei clienti puntati con una query
di controllo (service_role, `select=accepts_marketing` mantenendo gli stessi
filtri). Se **anche una sola** riga corrispondente ha `accepts_marketing !== true`
(false o null) → risposta **403** con corpo:

```json
{ "error": "L'utente non ha acconsentito al marketing su Shopify" }
```

Se tutte le righe corrispondenti sono consenzienti → si inoltra la query
originale e si restituisce il risultato. Se nessuna riga corrisponde
(cliente inesistente) → non è una violazione: si inoltra l'originale (che
tornerà `[]`).

### 2. Lettura non mirata → solo consenzienti

Qualsiasi altra lettura di `customers` (lista, conteggio, filtri non
identificativi, nessun filtro) è **non mirata**. Il proxy forza
`accepts_marketing=eq.true` sulla query inoltrata: tornano **solo i consenzienti**,
i non consenzienti restano invisibili. Nessun 403.

Poiché il filtro è in AND con quelli del chiamante, un tentativo di forzare
`accepts_marketing=eq.false` non può restituire i non consenzienti (AND con
`eq.true` → nessuna riga).

## Sicurezza

- La query di controllo consenso usa la **service_role** (come `forwardRead`),
  quindi vede la riga anche con RLS attiva. Il suo corpo NON viene mai restituito
  al chiamante: serve solo per la decisione 403/inoltro. Nessuna fuga di PII.
- Fail-closed: se la query di controllo non torna un `200` con un array JSON
  valido, si nega (403) invece di inoltrare — non si rischia di servire dati non
  verificati.
- Il messaggio 403 è volutamente esplicito (richiesto dall'owner) e non espone
  dati del cliente.

## Struttura

Nuovo modulo puro `app/lib/read-proxy/customer-consent.server.ts`:

- `IDENTIFIER_COLUMNS = ['email', 'phone', 'shopify_customer_id']`
- `isCustomerIdentifierLookup(search: string): boolean` — true se un parametro tra
  le colonne identificative ha valore che inizia con `eq.`.
- `consentCheckSearch(search: string): string` — clona la query, imposta
  `select=accepts_marketing`, mantiene i filtri; ritorna la stringa con `?`.
- `forceConsentedOnlySearch(search: string): string` — appende
  `accepts_marketing=eq.true` alla query (append di stringa, per non ri-codificare
  filtri PostgREST complessi).
- `rowsHaveNonConsented(rows: Array<{ accepts_marketing?: unknown }>): boolean` —
  `rows.some(r => r.accepts_marketing !== true)`.

Il loader di `app/routes/rest.v1.$table.tsx` orchestra: per `customers`, se lookup
mirato esegue la query di controllo con `forwardRead(ctx, 'customers',
consentCheckSearch(search))`, valuta `rowsHaveNonConsented`, e decide 403 o
inoltro dell'originale; altrimenti inoltra con `forceConsentedOnlySearch(search)`.

## Fuori scope

- Nessuna modifica alla sync (i clienti restano tutti sincronizzati).
- Nessuna modifica alla tabella `products`.
- Consenso al tracciamento/cookie (Customer Privacy API): non leggibile
  per-cliente dall'Admin API, non affrontato.

## Test

Vitest. Modulo puro:
- `isCustomerIdentifierLookup`: `email=eq.x` → true; `shopify_customer_id=eq.1` →
  true; `phone=eq.+39...` → true; `select=*&limit=3` (nessun eq identificativo) →
  false; `last_name=eq.Rossi` (eq ma non identificativo) → false.
- `consentCheckSearch`: preserva `email=eq.x`, imposta `select=accepts_marketing`.
- `forceConsentedOnlySearch`: da `?select=*` → contiene `accepts_marketing=eq.true`;
  da vuoto → `?accepts_marketing=eq.true`.
- `rowsHaveNonConsented`: `[{accepts_marketing:true}]` → false;
  `[{accepts_marketing:true},{accepts_marketing:false}]` → true;
  `[{accepts_marketing:null}]` → true; `[]` → false.

Route (`rest.v1.$table.test.ts`, mockando `forwardRead` e il context):
- `customers?email=eq.x` con cliente non consenziente → 403 col messaggio esatto,
  e NON viene inoltrata la query originale.
- `customers?email=eq.x` con cliente consenziente → inoltra e restituisce i dati.
- `customers?email=eq.x` senza corrispondenze (`[]`) → inoltra (torna `[]`), no 403.
- `customers?select=*&limit=10` (non mirato) → la query inoltrata contiene
  `accepts_marketing=eq.true`.
- `products?...` → nessun trattamento consenso (invariato).

## Criteri di completamento

- Lookup mirato su non consenziente → 403 col messaggio esatto; su consenziente →
  dati; senza match → `[]`.
- Letture-lista su `customers` → solo consenzienti.
- `products` invariato. `npm test` e `npm run build` verdi.

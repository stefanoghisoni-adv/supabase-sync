# Proxy di lettura con enforcement dello stato shop — Design

**Data:** 2026-07-20
**Stato:** approvato in brainstorming, in attesa di revisione dello spec

## Problema

I dati Shopify sincronizzati vivono nella Supabase **del merchant** e vengono
letti da tool di tracciamento server-side (Stape, GTM server-side, TAGGRS,
Elevar) via richieste HTTP con una chiave pubblica. L'owner gestisce nel proprio
database (Supabase "Tracking Sync") lo stato di ogni shop:
`ENABLED` / `PENDING` / `DISABLED`.

Obiettivo: quando lo shop è `PENDING` o `DISABLED`, il merchant **non deve poter
leggere** i dati sincronizzati. Il vincolo difficile è che il progetto Supabase è
del merchant: qualunque gate messo *dentro* quel database è rimovibile da chi lo
amministra, e una chiave letta lato server è ispezionabile in network tab.

## Decisione architetturale

Il gate NON vive nel database del merchant, ma in un **proxy di lettura ospitato
dall'owner**. Il tool di tracciamento legge dal dominio dell'owner; il proxy
controlla lo stato nel DB owner (autorevole, live) e inoltra alla Supabase del
merchant solo se `ENABLED`, usando la `service_role` che resta sull'infra
dell'owner. La RLS della Supabase del merchant resta chiusa (nessuna policy
`anon`), quindi l'accesso diretto a `<ref>.supabase.co` è bloccato dalla RLS: il
solo percorso di lettura è il proxy.

Alternative scartate:
- **Flag booleano nel DB merchant via webhook**: semplice ma il merchant può
  rimetterlo a `true` nel proprio database.
- **Token firmato (asimmetrico) nel DB merchant**: la verifica in-DB su Supabase
  è fragile (`pgsodium` in deprecazione) e comunque aggirabile riscrivendo la
  funzione di verifica; il più complesso dei tre.
- **Interrogazione live merchant→owner ad ogni lettura via estensione `http`**:
  mette una chiamata HTTP sul percorso caldo di ogni lettura, accoppiando le
  letture del merchant all'uptime dell'owner. `pg_net` è asincrona e non
  utilizzabile in una policy RLS.

## Perché è quasi un drop-in per Stape

Il template Stape costruisce l'URL come `projectUrl + '/rest/v1/' + tableName` e
manda gli header `apikey` / `Authorization: Bearer <apiKey>`. `projectUrl` e
`apiKey` sono parametri liberi. Il proxy espone la **stessa forma di URL** di
Supabase (`/rest/v1/<table>?<conditions>`), quindi il merchant cambia solo due
campi di configurazione, senza toccare il codice del template:

- `projectUrl`: `https://xxxx.supabase.co` → `https://<dominio-owner>`
- `apiKey`: anon key → **token-proxy per-shop emesso dall'owner**

`tableName`, `queryConditions`, `documentPath` e la cache del template restano
invariati.

## Componenti

### 1. Modello dati (DB owner / Prisma)

Aggiunta al modello `Shop` (migrazione non distruttiva):

- `readProxyTokenHash String? @unique @map("read_proxy_token_hash")` — SHA-256 del
  token, indicizzato: lookup O(1) del shop dal token in arrivo.
- `readProxyTokenEnc String? @map("read_proxy_token_enc")` — token cifrato
  (stessa utility `encrypt`/`decrypt` della service_role), per mostrarlo in
  Impostazioni.

Il token in chiaro non è mai persistito. Formato: prefisso identificativo
`spx_` + 32 byte casuali base64url.

### 2. Emissione e gestione del token

- Generato al primo collegamento riuscito (in coda a `select-project`) se assente.
- Azione "Rigenera chiave di lettura" in Impostazioni: sostituisce hash + cifrato,
  invalidando il token precedente.
- Impostazioni mostra: URL base del proxy (`SHOPIFY_APP_URL`), il token di lettura,
  e una nota su come configurarli in Stape/GTM. La anon key non serve più al
  merchant per le letture e viene tolta dalla vista (la `service_role` non è mai
  esposta, come oggi).

### 3. Endpoint proxy — `GET /rest/v1/:table`

Resource route pubblica (nessuna sessione Shopify), autenticata dal token-proxy.

Flusso:

1. Legge il token da `Authorization: Bearer <token>` (fallback header `apikey`).
2. `sha256(token)` → `Shop.readProxyTokenHash`. Non trovato → **401**.
3. Stato di autorizzazione (live, cache in-memory ~30s per shop): se
   `authorization !== 'ENABLED'` → **403**. Vale sia per `PENDING` che `DISABLED`.
4. Allowlist tabelle **dipendente dal piano**: `products` sempre; `customers` solo
   se `Plan.customersSyncEnabled`. Tabella non ammessa → **403**. (Con shop non
   `ENABLED` il 403 è già scattato al passo 3: nessuna tabella è leggibile.)
5. Solo metodo `GET`. Altri metodi → **405**.
6. Inoltro: costruisce
   `https://<supabaseProjectRef>.supabase.co/rest/v1/<table>?<querystring originale>`
   con header `apikey`/`Authorization` = `service_role` (decifrata dalla
   `SupabaseConfig`), esegue la GET, e restituisce **body e content-type
   identici**, propagando lo status di PostgREST. Così il `mapResponse` del
   template Stape funziona invariato.

Note di sicurezza:
- L'host di destinazione è derivato **solo** dal `supabaseProjectRef` memorizzato,
  mai da input dell'utente → nessun SSRF.
- Solo `GET`; nessuna scrittura possibile via proxy.
- La querystring è passata a PostgREST così com'è (linguaggio di filtro REST, non
  SQL): nessuna injection.
- Token = segreto bearer, solo su HTTPS; persistito solo come hash (+ cifrato per
  la visualizzazione).

### 4. Cache dello stato di autorizzazione

Cache in-memory per-istanza, chiave `shopId` → `{ authorization, expiresAt }`,
TTL 30s. Con Fluid Compute (istanze riusate) riduce il carico sul DB owner
mantenendo la freschezza a livello di mezzo minuto. Nessuna dipendenza esterna.

### 5. Impostazioni (UI)

- Sostituisce la "Public key (anon)" con **"Chiave di lettura (Stape/GTM)"**: URL
  base del proxy + token, entrambi copiabili.
- Pulsante "Rigenera chiave di lettura" con conferma (invalida la configurazione
  di tracciamento esistente finché non viene aggiornata).
- Breve istruzione: in Stape imposta `projectUrl` = URL base, `apiKey` = token.

## Comportamento di blocco

Bloccato = il proxy risponde **403** senza inoltrare. Il template Stape tratta uno
status non 2xx come "nessun dato" (`undefined`), quindi il tracciamento prosegue
senza dati arricchiti, senza errori visibili all'utente finale.

## Limite noto (onesto)

Il progetto Supabase è del merchant: può sempre estrarre i *propri* dati dalla sua
dashboard o con la *sua* service_role. Ma questo non è un bypass scalabile per il
tracciamento — richiederebbe di re-ingegnerizzare il tracking usando la
service_role, cioè proprio la pratica insicura (chiave visibile in network tab)
che il proxy evita. Per l'uso reale del tracciamento, il gate è inviolabile.

## Testing

Unit test (fetch verso Supabase mockato):
- token valido + `ENABLED` → inoltro con host derivato dal ref, header
  service_role, status/body propagati.
- token valido + `PENDING` → 403, nessun inoltro.
- token valido + `DISABLED` → 403, nessun inoltro.
- token assente/errato → 401.
- tabella `customers` con piano senza clienti → 403; con piano clienti → inoltro.
- tabella non prevista → 403.
- metodo non-GET → 405.
- costruzione URL di inoltro: host = `<ref>.supabase.co` dallo store, querystring
  preservata (anti-SSRF).
- hashing/lookup del token; rigenerazione invalida il precedente.
- cache TTL: entro 30s riusa lo stato, dopo rilegge.

## Fuori scope (progetti successivi, in ordine)

1. Search bar + paginazione a 20 nella tab "Prodotti con problemi".
2. Sincronizzare nella tabella solo i prodotti idonei (non quelli con problemi).
3. Rate limiting sul proxy.
4. Dominio dedicato per il proxy (ora usa `SHOPIFY_APP_URL`).

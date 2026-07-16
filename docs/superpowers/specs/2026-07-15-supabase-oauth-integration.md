# Supabase OAuth + Management API Integration — Design Specification

**Data:** 2026-07-15
**Autore:** Stefano Ghisoni
**Stato:** Approvata — da implementare
**Progetto:** App Shopify + Supabase (Vercel + Redis) — `shopify-supabase-sync`

---

## 1. Contesto e obiettivi

Oggi, per collegare Supabase, il merchant deve andare in Impostazioni e incollare
manualmente URL, anon key e service role key del proprio progetto. Obiettivo:
sostituire questo passaggio con un flusso **guidato via OAuth Supabase** dentro lo
Step 1 dello stepper. Dopo il consenso, l'app elenca i progetti dell'account in un
dropdown Polaris, e — su conferma — recupera in autonomia URL/anon/service key dal
progetto scelto, crea le tabelle e completa lo Step 1.

### Scope v1 (questa spec)

- OAuth Supabase (authorization code flow) in **popup**.
- Elenco dei **progetti esistenti** dell'account in un dropdown Polaris.
- Selezione progetto → **conferma esplicita** → recupero chiavi + creazione tabelle + `connectionVerifiedAt`.
- Se l'account non ha progetti: messaggio + link alla dashboard Supabase.

### Fuori scope v1 (fase 2)

- **Creazione di un nuovo progetto Supabase dall'app** (`POST /v1/projects`): richiede
  `organization_id`, password DB, `region`, gestione limiti free (max 2 progetti/org) e
  attesa di provisioning (~1-2 min). Rimandata a una spec dedicata.
- Cambio/scollegamento progetto, multi-org UI avanzata.

### Prerequisito una tantum (lato owner dell'app)

Registrare una **OAuth App su Supabase** (Organization settings → OAuth Apps):
- ottiene `client_id` e `client_secret`;
- redirect URL = `https://<app>.vercel.app/auth/supabase/callback`.

`client_id`/`client_secret` vanno nelle env var di Vercel. Senza questa registrazione
il flusso non è utilizzabile. È un'app OAuth **globale** (una sola, condivisa da tutti i
merchant), non per-merchant.

---

## 2. Flusso utente (Step 1 dello stepper)

1. Click **"Collega Supabase"** → il pulsante entra in stato **loading** (spinner) e si
   **disabilita**; `window.open()` apre una nuova finestra su `/auth/supabase/start`.
2. `/auth/supabase/start` genera uno `state` CSRF (legato allo shop), lo persiste, e fa
   **302** verso l'authorize di Supabase.
3. L'utente fa login/registrazione e **acconsente** su Supabase → redirect al **callback**
   `/auth/supabase/callback?code&state`.
4. Il callback valida lo `state`, **scambia il code** per `access_token` + `refresh_token`
   (cifrati, salvati per shop), poi renderizza una mini-pagina che fa
   `window.opener.postMessage({ type: 'supabase-oauth', ok: true }, APP_ORIGIN)` e
   `window.close()`.
5. L'app (Step 1) è in ascolto su `message` (con **validazione origine**): alla ricezione
   carica i progetti via `GET /api/supabase/projects` e mostra il **dropdown Polaris `Select`**.
   - **Nessun progetto** → messaggio "Nessun progetto trovato" + link alla dashboard Supabase.
6. L'utente seleziona un progetto → l'app mostra un **riepilogo** (nome progetto + URL) e un
   pulsante **"Conferma e crea tabelle"**.
7. Su conferma → `POST /api/supabase/select-project` con il `ref` del progetto:
   - recupera **anon key** e **service_role key** e **URL** del progetto;
   - salva la config cifrata in `supabase_configs`;
   - **crea le tabelle** `products`/`customers` nel DB del merchant;
   - imposta `connectionVerifiedAt` → **Step 1 completato**, Step 2 sbloccato.

Il form manuale in `settings.supabase.tsx` **rimane** come alternativa avanzata (inserimento
diretto delle chiavi), invariato.

---

## 3. Supabase Management API — endpoint usati

Base URL: `https://api.supabase.com`. Header auth: `Authorization: Bearer <access_token>`.

| Scopo | Chiamata |
|---|---|
| Authorize | `GET /v1/oauth/authorize?client_id=&redirect_uri=&response_type=code&state=` |
| Token exchange | `POST /v1/oauth/token` (form: `grant_type=authorization_code`, `code`, `redirect_uri`; client via Basic auth `client_id:client_secret`) |
| Refresh token | `POST /v1/oauth/token` (form: `grant_type=refresh_token`, `refresh_token`) |
| Lista progetti | `GET /v1/projects` → `[{ id (=ref), name, organization_id, region, status, ... }]` |
| Chiavi progetto | `GET /v1/projects/{ref}/api-keys?reveal=true` → `[{ name: 'anon' \| 'service_role', api_key }]` |
| Crea tabelle (DDL) | `POST /v1/projects/{ref}/database/query` (body `{ query }`) |
| URL progetto | derivato: `https://{ref}.supabase.co` |

> Nota implementazione: gli shape esatti (nomi campi, necessità di `?reveal=true` per la
> service_role, formato del token endpoint) vanno verificati contro la documentazione
> corrente di Supabase Management API in fase di implementazione, isolando le chiamate in
> un client dedicato (`app/lib/supabase-management.server.ts`) così che eventuali
> aggiustamenti restino in un solo file.

**Miglioria inclusa:** la creazione tabelle usa `POST /v1/projects/{ref}/database/query`
(abilitato dall'OAuth), **non** l'RPC `exec_sql` — risolvendo la limitazione nota
(`exec_sql` assente nei Supabase standard). Il DDL riutilizza esattamente lo stesso SQL di
`app/routes/api.supabase.create-tables.tsx`.

---

## 4. Componenti e file

| File | Responsabilità |
|---|---|
| `app/lib/supabase-management.server.ts` (nuovo) | Client Management API: `buildAuthorizeUrl`, `exchangeCode`, `refreshToken`, `listProjects`, `getProjectApiKeys`, `runQuery`. Isola tutte le chiamate HTTP e il parsing. |
| `app/lib/supabase-oauth.server.ts` (nuovo) | Gestione token per shop: salva/legge token cifrati, restituisce un access token valido (refresh se scaduto). |
| `prisma/schema.prisma` + migrazione | Nuova tabella `supabase_oauth_tokens` (1:1 con `shops`). |
| `app/routes/auth.supabase.start.tsx` (nuovo) | Genera `state`, lo persiste, 302 verso authorize. |
| `app/routes/auth.supabase.callback.tsx` (nuovo) | Valida `state`, exchange code, salva token, pagina con `postMessage`+`close`. |
| `app/routes/api.supabase.projects.tsx` (nuovo) | `GET`: lista progetti dell'account (usa token, refresh se serve). |
| `app/routes/api.supabase.select-project.tsx` (nuovo) | `POST`: recupera chiavi+URL, salva config cifrata, crea tabelle, set `connectionVerifiedAt`. |
| `app/routes/_index.tsx` | Contenuto Step 1: bottone→popup (spinner/disabled), listener `message`, dropdown `Select`, riepilogo + conferma. |
| `app/utils/crypto.server.ts` | Riuso `encrypt`/`decrypt` (AES-256-GCM) per i token OAuth. |

### `supabase_oauth_tokens` (bozza schema)

```prisma
model SupabaseOAuthToken {
  id           String   @id @default(uuid())
  shopId       String   @unique @map("shop_id")
  accessToken  String   @map("access_token")   // cifrato
  refreshToken String   @map("refresh_token")  // cifrato
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  @@map("supabase_oauth_tokens")
}
```

---

## 5. Sicurezza

- **CSRF `state`:** valore random legato allo shop, persistito server-side (o firmato) e
  verificato nel callback; scarto se non combacia.
- **Token cifrati:** `access_token`/`refresh_token` cifrati con AES-256-GCM
  (`ENCRYPTION_SECRET`), mai in log né esposti al client.
- **`postMessage` con origine verificata:** il callback invia solo all'origine dell'app; il
  listener nell'app accetta solo messaggi da quell'origine.
- **service_role key:** trattata come le altre credenziali sensibili — cifrata, mai
  restituita al frontend, mai loggata.
- **Nessun segreto lato client:** `client_secret` solo server-side (env var Vercel).

### 5.1 Modello di minaccia "Account-Linking CSRF" (rischio residuo accettato)

Rilevato da una security review automatica sul callback (`auth.supabase.callback.tsx`),
che ricava lo `shopId` **esclusivamente dallo `state` firmato** (il callback gira in un
popup senza sessione Shopify).

- **Scenario grave — MITIGATO.** Un attaccante non può dirottare il collegamento del
  negozio di una vittima: lo `state` è firmato HMAC (`ENCRYPTION_SECRET`, TTL 10 min,
  confronto `timingSafeEqual`) ed è coniato **solo** da `POST /api/supabase/oauth-url`, che
  è autenticato (`authenticate.admin`) e lo emette **unicamente per lo shop del chiamante**.
  Non essendo forgiabile uno `state` per un altro shop, non è possibile iniettare un `code`
  Supabase per collegare il proprio account al negozio altrui.
- **Residuo — ACCETTATO (bassa severità, phishing-gated).** Un merchant malevolo potrebbe
  attirare una vittima a completare *attivamente* il consenso Supabase partendo da un link
  con il proprio `state`, collegando così il Supabase della vittima al **proprio** shop.
  Richiede social engineering e il completamento manuale della schermata di consenso Supabase.
- **Perché non si applica il fix "da manuale" (cookie-nonce legato alla sessione).** Il
  callback è un popup senza sessione e l'app è **embedded in Shopify**: un cookie-nonce
  first-party del nostro dominio impostato/letto dall'iframe dipende dai cookie di terze
  parti, sempre più bloccati (Safari ITP, Chrome). Introdurrebbe complessità e un falso senso
  di sicurezza per un beneficio inaffidabile in produzione. Per questo il design resta sullo
  `state` firmato/stateless.
- **Hardening futuro (se il residuo diventasse rilevante).** Rafforzare la conferma finale
  nel contesto pienamente autenticato — `POST /api/supabase/select-project` gira già sotto
  `authenticate.admin` — e/o rivalutare il cookie-nonce quando i vincoli sui cookie di terze
  parti nel contesto embedded lo renderanno affidabile.

---

## 6. Gestione errori (tutti → banner chiaro nello Step 1 + pulsante riabilitato)

- Popup bloccato dal browser → messaggio "Consenti i popup per collegare Supabase".
- Consenso negato / callback con `error` → messaggio e possibilità di riprovare.
- `state` non valido → interruzione con messaggio di sicurezza.
- Token scaduto → **refresh automatico**; se il refresh fallisce → richiedi ri-collegamento.
- Management API 4xx/5xx → messaggio con lo status; retry manuale.
- Nessun progetto nell'account → stato vuoto con link alla dashboard Supabase.
- Creazione tabelle fallita (`database/query` in errore) → `connectionVerifiedAt` resta
  `null`, Step 2 non si sblocca, banner con l'errore.

---

## 7. Strategia di test

- **Unit (vitest, funzioni pure / con fetch mockato):**
  - `buildAuthorizeUrl` produce l'URL con i parametri corretti (`client_id`, `redirect_uri`,
    `response_type`, `state`).
  - parsing della risposta token (`access_token`/`refresh_token`/`expires_in`).
  - mapping della lista progetti (ref/name/organization).
  - estrazione anon/service_role da `api-keys`.
  - logica "token scaduto → refresh" (in base a `expiresAt`).
- **Integrazione (fetch mockato):** `select-project` → chiavi recuperate → config salvata →
  DDL inviato → `connectionVerifiedAt` impostato.
- **Typecheck + manuale:** route OAuth (start/callback), popup+`postMessage`, dropdown,
  riepilogo+conferma, stati d'errore. (Nessun `@testing-library/react` nel progetto:
  i componenti si verificano con `npm run typecheck` + prova manuale.)

---

## 8. Prerequisiti di rollout (fuori da questa implementazione, ma necessari)

1. Registrare la **OAuth App su Supabase** e impostare le env var Vercel
   (`SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET`).
2. Applicare la migrazione `supabase_oauth_tokens` al DB metadata di produzione.
3. Chiudere i due fili aperti dell'incident corrente **prima** di questa feature:
   (a) tabella `sessions` creata e app di nuovo operativa; (b) hardening del messaggio
   d'errore in `_index.tsx` (evitare info-disclosure del testo grezzo).

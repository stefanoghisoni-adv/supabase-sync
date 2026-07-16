# Step 1: Revisione UX + Creazione Progetto Supabase — Design Specification

**Data:** 2026-07-16
**Autore:** Stefano Ghisoni
**Stato:** Approvata — da implementare
**Progetto:** App Shopify + Supabase (Vercel + Redis) — `shopify-supabase-sync`
**Dipende da:** `2026-07-15-supabase-oauth-integration.md` (flusso OAuth già in produzione)

---

## 1. Contesto e obiettivi

Il flusso "Collega Supabase" (OAuth) è live. Questa spec ne rifinisce la UX dello Step 1
e aggiunge la **creazione di un nuovo progetto Supabase dall'app** (era rimandata alla fase 2).

Ricorda la distinzione architetturale fondamentale:
- **DB proprietario** (owner): il Supabase con `shops`, `sessions`, `supabase_configs`,
  `supabase_oauth_tokens`. Gira sull'infrastruttura dell'owner (Vercel + Upstash Redis).
- **DB del merchant**: quando un negozio collega Supabase via OAuth, le tabelle
  `products`/`customers`/`bom` vengono create **nel progetto Supabase del merchant**, sul
  **suo** account. Questa spec (creazione progetto, password DB) agisce **sul DB del merchant**.

### Scope

1. Rifiniture UX Step 1: spinner **dentro** al pulsante, dropdown progetti **Polaris custom**
   a ~metà larghezza, pulsante **"Disconnetti"** quando connesso.
2. **Creazione nuovo progetto** dall'app (full): nome + region + password auto-generata,
   attesa provisioning con polling, poi creazione tabelle e completamento Step 1.
3. **Rigenera password** DB del progetto merchant (reset su Supabase + copia cifrata aggiornata).

### Fuori scope

- **Performance del caricamento app** (LCP ~8s): fase separata, con diagnosi e spec dedicate.
- Multi-org UI (l'organizzazione è già scelta nel consent screen Supabase, ricavata dal token).

---

## 2. Stati del componente `SupabaseConnect`

| Stato | Condizione | UI |
|---|---|---|
| **Non connesso** | nessun token OAuth valido | Testo esplicativo per nuovi utenti ("verrai portato su Supabase per accedere o creare gratuitamente un account, poi torni qui"). Primary **"Collega Supabase"** con **spinner interno** (`Button loading`), niente spinner esterno. |
| **Connesso, nessun progetto** | token valido, `connectionVerifiedAt` null | **Dropdown Polaris custom** (Combobox/Listbox, non `<select>` nativo) largo **~50%**, con progetti esistenti + voce **"➕ Crea nuovo progetto"**. Selezione progetto esistente → riepilogo + "Conferma e crea tabelle". Selezione "Crea nuovo" → form §3. |
| **Connesso + collegato** | `connectionVerifiedAt` valorizzato | Riepilogo del collegamento (nome progetto + URL) + pulsante **"Disconnetti"**. Primary **"Collega Supabase" resta visibile ma disabilitato**. |

Empty-state (account senza progetti) invariato: banner con link alla dashboard Supabase,
oltre alla voce "Crea nuovo progetto" nel dropdown.

---

## 3. Flusso "Crea nuovo progetto" (full)

Selezionando "➕ Crea nuovo progetto" compare un **form inline**:

- **Nome progetto** — campo testo (validazione: non vuoto).
- **Region** — dropdown Polaris popolato **dinamicamente da Supabase** (§4 `listRegions`;
  fallback lista ufficiale corrente se l'endpoint non esiste). Default una region **UE**
  (Frankfurt, o Milano se disponibile).
- **Password DB** — **auto-generata** dal server (random forte), mostrata **una volta** con
  pulsante **"Copia"**, e pulsante **"Rigenera password"** (§5). Salvata **cifrata**.
- **Organizzazione** — NON mostrata: ricavata dal token OAuth (`listOrganizations`), l'utente
  l'ha già scelta nel consent screen Supabase.
- Pulsante **"Crea progetto"**.

Al click "Crea progetto":
1. `POST /api/supabase/create-project` con `{ name, region }` → il server genera la password,
   ricava `organization_id`, chiama `createProject`, salva `supabase_project_ref` +
   `supabase_db_password` (cifrata), e **ritorna** `{ ref, password }` (password mostrata una volta).
2. Il componente entra in stato **"Creazione in corso…"** e fa **polling** su
   `GET /api/supabase/project-status?ref=…` ogni ~5s finché lo stato è `ACTIVE_HEALTHY`
   (timeout di sicurezza ~3 min con messaggio "ci sta mettendo più del previsto, riprova").
3. A progetto pronto → chiamata a **`select-project`** (riuso invariato) che recupera chiavi +
   URL, salva la config cifrata, crea le tabelle `products`/`customers`, imposta
   `connectionVerifiedAt` → **Step 1 completato**.

**Vincolo Vercel (critico):** le serverless hanno timeout breve; il provisioning (~1-2 min)
**non** può stare dentro una singola richiesta. Perciò `create-project` **avvia e ritorna
subito**, e l'attesa è gestita dal **polling lato client**.

---

## 4. Management API — nuove funzioni (`app/lib/supabase-management.server.ts`)

Base `https://api.supabase.com`, `Authorization: Bearer <access_token>`.

| Funzione | Chiamata | Note |
|---|---|---|
| `listOrganizations(token)` | `GET /v1/organizations` | ritorna l'org autorizzata; se >1, si usa la prima (in pratica il token è legato a una sola org scelta nel consent). |
| `listRegions(token)` | endpoint regioni **se disponibile**, altrimenti costante `SUPABASE_REGIONS` mantenuta nel codice | popola il dropdown region. |
| `createProject(token, { name, organizationId, region, dbPass })` | `POST /v1/projects` | ritorna `{ id (=ref), ... }`. Piano/istanza: default free/nano. |
| `getProject(token, ref)` | `GET /v1/projects/{ref}` | per il polling: legge `status` (atteso `ACTIVE_HEALTHY`). |
| `resetDbPassword(token, ref, newPass)` | endpoint reset password DB **da verificare** | §5; degrada se non disponibile. |

Gli shape esatti (nomi campi, endpoint region/reset) vanno verificati contro la doc corrente
Supabase in fase di implementazione, isolati in questo client.

---

## 5. Rigenera password

- Genera una nuova password forte (server-side), chiama `resetDbPassword(token, ref, newPass)`
  su Supabase (progetto del merchant), e **aggiorna la copia cifrata** in `supabase_configs`.
- "Sincronizzata ovunque" = i due soli posti dove la password del progetto merchant esiste nel
  nostro flusso: **Supabase** + **copia cifrata nostra**. Non esistono altre piattaforme nel
  flusso merchant (Vercel/Redis sono infrastruttura owner, non toccano il DB del merchant).
- **Dipendenza:** se la Management API non espone il reset password, il pulsante "Rigenera"
  **degrada** con messaggio esplicativo (nessun crash), e si documenta la limitazione.

---

## 6. "Disconnetti" (non distruttivo)

`POST /api/supabase/disconnect`:
- cancella la riga `supabase_oauth_tokens` dello shop;
- azzera `supabase_configs` per lo shop (inclusi `connectionVerifiedAt`, chiavi,
  `supabase_db_password`, `supabase_project_ref`) — oppure lo elimina;
- lo Step 1 torna **"Non connesso"**.

**Non** elimina il progetto Supabase del merchant né le sue tabelle/dati: rimuove solo il
collegamento. Conferma esplicita nell'UI ("Vuoi scollegare Supabase? I dati sul tuo progetto
restano intatti.").

---

## 7. Modello dati

`supabase_configs` — nuove colonne **nullable** (retro-compatibili con le config manuali esistenti):

```prisma
supabaseDbPassword  String?  @map("supabase_db_password")   // cifrata AES-256-GCM
supabaseProjectRef  String?  @map("supabase_project_ref")   // ref del progetto merchant
```

Migrazione additiva (nessun backfill necessario).

---

## 8. Nuove route

| Route | Metodo | Responsabilità |
|---|---|---|
| `api.supabase.regions` | `GET` | lista region per il dropdown (autenticata). |
| `api.supabase.create-project` | `POST` | genera password, ricava org, `createProject`, salva ref+password cifrata, ritorna `{ ref, password }`. |
| `api.supabase.project-status` | `GET` | `?ref=` → stato del progetto per il polling. |
| `api.supabase.regenerate-password` | `POST` | reset password su Supabase + aggiorna copia cifrata. |
| `api.supabase.disconnect` | `POST` | scollega (token + config). |

Tutte autenticate (`authenticate.admin`), con lookup shop e gestione errori generici verso il
client (log server sanitizzati, come da hardening §5.1 della spec OAuth).

---

## 9. Sicurezza

- Password DB e chiavi: **cifrate** AES-256-GCM, mai loggate. La password in chiaro transita al
  client **una sola volta** (visualizzazione + copia), su HTTPS — come fa Supabase stesso.
- Nessun nuovo scope OAuth oltre a quelli già concessi (Database RW, Secrets R, Projects R);
  `createProject` richiede **Projects Write** → **verificare** se lo scope attuale (Projects Read)
  basta; se serve Write, va aggiornata la OAuth App e ri-consentito. **Da confermare in
  implementazione** (potenziale prerequisito di rollout).
- Log sanitizzati (solo `e.message`) su tutte le nuove route.

---

## 10. Gestione errori (banner chiaro nello Step 1)

- Limite free superato (max 2 progetti/org) → messaggio esplicito.
- Provisioning oltre timeout → "ci sta mettendo più del previsto, riprova tra poco".
- `createProject`/`select-project`/reset in errore → `connectionVerifiedAt` resta null, Step 2
  non si sblocca, banner con causa.
- Reset password non supportato dall'API → pulsante degrada con messaggio.

---

## 11. Strategia di test

- **Unit (vitest, fetch mockato):** `listOrganizations`, `listRegions` (+ fallback),
  `createProject`, `getProject` (mapping status), `resetDbPassword`; cifratura/decifratura della
  password DB.
- **Integrazione (fetch mockato):** create-project → status ready → select-project →
  `connectionVerifiedAt` impostato.
- **Typecheck + manuale:** componente (spinner interno, dropdown Polaris custom, form creazione,
  polling, disconnetti). Nessun `@testing-library/react` nel progetto.

---

## 12. Prerequisiti di rollout (eventuali, lato owner)

1. **Se `createProject` richiede lo scope Projects: Write** (oggi Read) → aggiornare la OAuth App
   su Supabase e far ri-autorizzare i merchant. Da confermare in implementazione.
2. Migrazione additiva `supabase_configs` (2 colonne) sul DB metadata di produzione.

-- Sdoppia l'autorizzazione: una per l'uso dell'app, una per il tracciamento.
--
-- Prima erano la stessa cosa: sospendere un negozio spegneva anche le letture
-- di tracciamento. Ora sono due interruttori indipendenti — un negozio a cui
-- l'app e' sospesa puo' continuare a leggere i dati gia' sincronizzati (fermi,
-- ma utilizzabili), e si puo' fermare il solo tracciamento lasciando l'app in
-- funzione.
--
-- Idempotente: la colonna viene aggiunta solo se manca, cosi' l'SQL si puo'
-- eseguire a mano sul database owner (il pooler sulla 6543 non esegue DDL) e
-- poi di nuovo dalle migrazioni senza effetti.
--
-- NB: "authorization" e' una parola riservata in PostgreSQL, va sempre quotata.

ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "tracking_authorization" "authorization_state"
  NOT NULL DEFAULT 'ENABLED'::"authorization_state";

-- Allinea i negozi gia' esistenti allo stato che avevano fino a ieri: chi era
-- sospeso resta senza tracciamento finche' l'owner non decide diversamente.
-- Solo alla prima esecuzione (quando la colonna e' ancora tutta al default).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "shops" WHERE "tracking_authorization" <> 'ENABLED'::"authorization_state"
  ) THEN
    UPDATE "shops" SET "tracking_authorization" = "authorization"
    WHERE "authorization" <> 'ENABLED'::"authorization_state";
  END IF;
END
$$;

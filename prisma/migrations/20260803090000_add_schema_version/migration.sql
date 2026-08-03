-- Versione dello schema applicata al database di ciascun merchant.
--
-- Serve a sapere quali progetti sono indietro rispetto a cio' che l'app si
-- aspetta, cosi' l'aggiornamento delle loro tabelle puo' partire da solo invece
-- di richiedere SQL eseguito a mano su ogni progetto.
--
-- 0 = collegamento anteriore a questo meccanismo: quei progetti verranno
-- aggiornati alla prima occasione utile.
--
-- Idempotente: si puo' eseguire a mano sul database owner (il pooler sulla 6543
-- non esegue DDL) e poi di nuovo dalle migrazioni senza effetti.

ALTER TABLE "supabase_configs"
  ADD COLUMN IF NOT EXISTS "schema_version" INTEGER NOT NULL DEFAULT 0;

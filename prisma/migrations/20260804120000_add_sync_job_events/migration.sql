-- Dettaglio delle sincronizzazioni: eventi di aggiunta/rimozione prodotti e
-- aggiunta/aggiornamento/sospensione clienti, visibili nel modal "Vedi dettagli"
-- della tab Logs.
--
-- I totali veri stanno su sync_jobs (products_added, products_removed, ecc.)
-- perché il dettaglio viene troncato a 500 righe per categoria per job: senza
-- quelli il modal non può scrivere "mostrate 500 di 3.412".
--
-- Idempotente: si può eseguire a mano sul database owner (il pooler sulla 6543
-- non esegue DDL) e poi di nuovo dalle migrazioni senza effetti.

-- 1. Aggiunge le colonne di conteggio su sync_jobs
ALTER TABLE "sync_jobs"
  ADD COLUMN IF NOT EXISTS "products_added" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "products_removed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_added" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_updated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_suspended" INTEGER NOT NULL DEFAULT 0;

-- 2. Crea la tabella degli eventi (solo se non esiste)
CREATE TABLE IF NOT EXISTS "sync_job_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sync_job_id" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "shopify_id" BIGINT,
  "variant_id" BIGINT,
  "label" TEXT NOT NULL,
  "sublabel" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Crea l'indice sulla foreign key (solo se non esiste)
CREATE INDEX IF NOT EXISTS "sync_job_events_sync_job_id_idx"
  ON "sync_job_events"("sync_job_id");

-- 4. Aggiunge la foreign key (solo se non esiste)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sync_job_events_sync_job_id_fkey'
  ) THEN
    ALTER TABLE "sync_job_events"
      ADD CONSTRAINT "sync_job_events_sync_job_id_fkey"
      FOREIGN KEY ("sync_job_id")
      REFERENCES "sync_jobs"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;

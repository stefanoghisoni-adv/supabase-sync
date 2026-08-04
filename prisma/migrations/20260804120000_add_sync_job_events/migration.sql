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
--
-- Sui tipi: sync_jobs.id è UUID, non TEXT. Lo schema di questo database è nato a
-- mano in Supabase, mentre Prisma per un `String @id @default(uuid())`
-- scriverebbe TEXT. La colonna che lo referenzia deve avere lo stesso tipo,
-- altrimenti Postgres rifiuta la foreign key: "Key columns are of incompatible
-- types: text and uuid".

-- 1. Aggiunge le colonne di conteggio su sync_jobs
ALTER TABLE "sync_jobs"
  ADD COLUMN IF NOT EXISTS "products_added" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "products_removed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_added" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_updated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customers_suspended" INTEGER NOT NULL DEFAULT 0;

-- 2. Toglie di mezzo un tentativo precedente rimasto a metà: una tabella creata
--    con sync_job_id TEXT non potrà mai ricevere la foreign key. Si elimina solo
--    se è ancora vuota; se dentro ci fosse del dettaglio vero è meglio fermarsi
--    e guardare cosa c'è, invece di buttarlo via di nascosto.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sync_job_events'
      AND column_name = 'sync_job_id'
      AND data_type <> 'uuid'
  ) THEN
    IF EXISTS (SELECT 1 FROM "sync_job_events" LIMIT 1) THEN
      RAISE EXCEPTION
        'sync_job_events ha sync_job_id del tipo sbagliato ma contiene già dati: convertire a mano';
    END IF;
    DROP TABLE "sync_job_events";
  END IF;
END
$$;

-- 3. Crea la tabella degli eventi (solo se non esiste)
CREATE TABLE IF NOT EXISTS "sync_job_events" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "sync_job_id" UUID NOT NULL,
  "entity" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "shopify_id" BIGINT,
  "variant_id" BIGINT,
  "label" TEXT NOT NULL,
  "sublabel" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Crea l'indice sulla foreign key (solo se non esiste)
CREATE INDEX IF NOT EXISTS "sync_job_events_sync_job_id_idx"
  ON "sync_job_events"("sync_job_id");

-- 5. Aggiunge la foreign key (solo se non esiste)
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

-- La risposta del merchant sull'infrastruttura server side, e le piattaforme
-- per cui raccoglie dati.
--
-- Una riga per negozio (la chiave primaria e' lo shop): e' una risposta, non
-- uno storico. Se cambia idea si riscrive.
--
-- Additiva: nuova tabella, nessuna colonna toccata.

CREATE TABLE IF NOT EXISTS "tracking_setups" (
    "shop_id" TEXT NOT NULL,
    -- 'needs' = ha chiesto un'infrastruttura, 'has' = dichiara di averla gia'.
    "answer" TEXT NOT NULL,
    -- Nomi delle piattaforme spuntate: "Meta Ads", "Klaviyo", …
    "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_setups_pkey" PRIMARY KEY ("shop_id")
);

DO $$ BEGIN
  ALTER TABLE "tracking_setups" ADD CONSTRAINT "tracking_setups_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "tracking_setups" ENABLE ROW LEVEL SECURITY;

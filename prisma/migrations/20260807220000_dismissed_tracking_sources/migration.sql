-- Fonti di eventi che il merchant ha dichiarato innocue.
--
-- Serve perche' un canale puo' essere collegato solo per il catalogo, con il
-- tracciamento spento: li' l'avviso e' rumore, e un avviso che non si puo' far
-- tacere si impara a ignorare — anche quando dice qualcosa di vero.
--
-- Additiva: nuova tabella, nessuna colonna toccata.

CREATE TABLE IF NOT EXISTS "dismissed_tracking_sources" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    -- 'channel' oppure 'theme'.
    "kind" TEXT NOT NULL,
    -- Nome dello strumento: "Meta", "Google Analytics 4", …
    "name" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_tracking_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dismissed_tracking_sources_shop_id_kind_name_key"
  ON "dismissed_tracking_sources"("shop_id", "kind", "name");

DO $$ BEGIN
  ALTER TABLE "dismissed_tracking_sources" ADD CONSTRAINT "dismissed_tracking_sources_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "dismissed_tracking_sources" ENABLE ROW LEVEL SECURITY;

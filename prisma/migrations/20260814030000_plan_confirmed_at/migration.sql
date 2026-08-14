-- Quando il merchant ha confermato il piano dal passo della configurazione.
--
-- Serve perche' confermare il piano che si ha gia' non attiva nessun
-- abbonamento: `plan_started_at` resta null, e senza una traccia propria il
-- passo non si chiudeva mai — restava aperto anche a sincronizzazione conclusa,
-- e il passo successivo non si sbloccava.
--
-- Additiva: colonna nuova, nullable, nessun dato toccato.

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "plan_confirmed_at" TIMESTAMP(3);

-- last_synced_plan: piano dell'ultima sync completata, guida il riabilitarsi del
-- pulsante e il banner di cambio piano.
-- plan_banner_shown_at: il banner e' gia' stato mostrato una volta, non deve
-- riapparire alla riapertura dell'app.
-- IF NOT EXISTS perche' sul DB owner vengono applicate a mano (il pooler non
-- esegue DDL).
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "last_synced_plan" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "plan_banner_shown_at" TIMESTAMP;

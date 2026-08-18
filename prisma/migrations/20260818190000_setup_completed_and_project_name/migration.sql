-- Quando la configurazione e' arrivata in fondo la prima volta: da li' in poi
-- non ci si torna piu', se non scollegando l'account.
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "setup_completed_at" TIMESTAMP(3);

-- Nome del progetto Supabase, accanto al suo riferimento.
ALTER TABLE "supabase_configs" ADD COLUMN IF NOT EXISTS "supabase_project_name" TEXT;

-- I negozi che hanno gia' finito la configurazione non devono rifarla al primo
-- accesso dopo questo aggiornamento: se hanno un database collegato e un piano
-- confermato, la configurazione era conclusa.
UPDATE "shops" s
SET "setup_completed_at" = COALESCE(s."plan_confirmed_at", NOW())
WHERE s."setup_completed_at" IS NULL
  AND s."plan_confirmed_at" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "supabase_configs" c
    WHERE c."shop_id" = s."id" AND c."connection_verified_at" IS NOT NULL
  );

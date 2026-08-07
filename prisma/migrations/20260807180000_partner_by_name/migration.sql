-- I riferimenti al partner passano dall'id opaco al nome leggibile.
--
-- Perche': queste righe si assegnano a mano dal Table Editor, e un uuid non
-- dice a chi appartengono. `partners.name` e' univoco e stabile ("webeing"),
-- mentre `label` resta il nome visualizzato, modificabile senza conseguenze.
-- E' la stessa scelta gia' fatta per shops.current_plan → plans.plan_name.
--
-- ON UPDATE CASCADE: se un giorno il nome tecnico cambia, i riferimenti lo
-- seguono invece di rompersi.

-- 1. Colonne nuove
ALTER TABLE "partner_plan_prices" ADD COLUMN IF NOT EXISTS "partner_name" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "partner_name" TEXT;

-- 2. Travaso dei dati esistenti, prima di togliere le vecchie colonne
UPDATE "partner_plan_prices" pp
   SET "partner_name" = p."name"
  FROM "partners" p
 WHERE p."id" = pp."partner_id" AND pp."partner_name" IS NULL;

UPDATE "shops" s
   SET "partner_name" = p."name"
  FROM "partners" p
 WHERE p."id" = s."partner_id" AND s."partner_name" IS NULL;

-- 3. Via i vincoli e le colonne vecchie
ALTER TABLE "partner_plan_prices" DROP CONSTRAINT IF EXISTS "partner_plan_prices_partner_id_fkey";
ALTER TABLE "shops" DROP CONSTRAINT IF EXISTS "shops_partner_id_fkey";
DROP INDEX IF EXISTS "partner_plan_prices_partner_id_plan_name_key";
ALTER TABLE "partner_plan_prices" DROP COLUMN IF EXISTS "partner_id";
ALTER TABLE "shops" DROP COLUMN IF EXISTS "partner_id";

-- 4. Il nome del partner e' obbligatorio su una riga di prezzo: una tariffa che
--    non si sa a chi appartenga non serve a nessuno.
ALTER TABLE "partner_plan_prices" ALTER COLUMN "partner_name" SET NOT NULL;

-- 5. Vincoli nuovi
CREATE UNIQUE INDEX IF NOT EXISTS "partner_plan_prices_partner_name_plan_name_key"
  ON "partner_plan_prices"("partner_name", "plan_name");

DO $$ BEGIN
  ALTER TABLE "partner_plan_prices" ADD CONSTRAINT "partner_plan_prices_partner_name_fkey"
    FOREIGN KEY ("partner_name") REFERENCES "partners"("name") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shops" ADD CONSTRAINT "shops_partner_name_fkey"
    FOREIGN KEY ("partner_name") REFERENCES "partners"("name") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

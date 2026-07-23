-- Converte shops.authorization da testo libero a enum, cosi' il Table Editor di
-- Supabase offre i soli valori ammessi e un refuso diventa impossibile.
--
-- Idempotente: sul DB owner di produzione la conversione e' gia' stata applicata
-- a mano nel SQL editor (il pooler sulla 6543 non esegue DDL), quindi qui deve
-- essere un no-op; su un database pulito deve invece applicarla.
--
-- NB: "authorization" e' una parola riservata in PostgreSQL (CREATE SCHEMA ...
-- AUTHORIZATION), quindi l'identificatore va sempre quotato.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authorization_state') THEN
    CREATE TYPE "authorization_state" AS ENUM ('ENABLED', 'PENDING', 'DISABLED');
  END IF;
END
$$;

DO $$
BEGIN
  -- Converte solo se la colonna e' ancora testuale.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops'
      AND column_name = 'authorization'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE "shops" ALTER COLUMN "authorization" DROP DEFAULT;
    ALTER TABLE "shops"
      ALTER COLUMN "authorization" TYPE "authorization_state"
      USING "authorization"::"authorization_state";
    ALTER TABLE "shops"
      ALTER COLUMN "authorization" SET DEFAULT 'ENABLED'::"authorization_state";
  END IF;
END
$$;

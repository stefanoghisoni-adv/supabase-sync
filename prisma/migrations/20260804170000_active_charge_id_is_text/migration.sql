-- shops.active_charge_id conserva l'id numerico dell'abbonamento Shopify
-- (es. 31234567890), non un uuid: e' la parte finale del gid
-- gid://shopify/AppSubscription/31234567890.
--
-- Nel database owner la colonna era stata creata `uuid`. Prisma la dichiara
-- String e leggerla funzionava, quindi il difetto non si vedeva: falliva solo
-- la SCRITTURA, cioe' l'unico momento che conta — l'attivazione di un piano a
-- pagamento. Il merchant approvava l'addebito su Shopify, la callback provava a
-- scrivere l'id dell'abbonamento e Postgres rifiutava con "invalid input syntax
-- for type uuid": piano non applicato, nessuna riga in billing_charges.
--
-- Effetto collaterale della stessa cosa: al cambio di piano l'abbonamento
-- precedente non veniva chiuso, perche' il codice si aspetta un id di sole
-- cifre e un uuid non lo e'.
--
-- Sulla colonna c'era anche una foreign key verso billing_charges(id), residuo
-- di un disegno diverso: quella avrebbe richiesto l'id della NOSTRA riga di
-- addebito, mentre tutto il codice ci mette e ci rilegge l'id di Shopify (per
-- ricomporre il gid dell'abbonamento e per cancellarlo al cambio di piano).
-- Nessuna riga la usava — active_charge_id e' null ovunque — e finche' resta in
-- piedi impedisce di cambiare il tipo. Va tolta: il legame con billing_charges
-- passa gia' da shopify_charge_id, che e' l'id di Shopify su entrambe le tabelle.
--
-- Idempotente: si puo' rieseguire senza effetti.

-- 1. Via la foreign key. Cercata per colonna e non per nome: se in un altro
--    database si chiamasse diversamente, il nome fisso non la troverebbe e la
--    ALTER qui sotto fallirebbe di nuovo.
DO $$
DECLARE
  vincolo record;
BEGIN
  FOR vincolo IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = '"shops"'::regclass
      AND c.contype = 'f'
      AND a.attname = 'active_charge_id'
  LOOP
    EXECUTE format('ALTER TABLE "shops" DROP CONSTRAINT %I', vincolo.conname);
  END LOOP;
END
$$;

-- 2. Il tipo giusto.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shops'
      AND column_name = 'active_charge_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "shops"
      ALTER COLUMN "active_charge_id" TYPE text USING "active_charge_id"::text;
  END IF;
END
$$;

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
-- Idempotente: si puo' rieseguire senza effetti.

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

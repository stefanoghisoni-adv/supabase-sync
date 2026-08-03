-- SUPERATO — non serve piu' eseguirlo a mano.
--
-- Questa rinomina e' ora il passo 1 di app/lib/supabase/merchant-migrations.ts:
-- l'app la applica da sola sui progetti dei merchant, alla sincronizzazione o
-- all'apertura della dashboard. Il file resta come storia di com'e' nata.
--
-- Rinomina delle colonne identificative della tabella clienti:
--   email -> email_address
--   phone -> phone_number
--
-- Perche' a mano: la DDL dell'app gira al collegamento del progetto e quando
-- manca la tabella clienti, e sa solo AGGIUNGERE colonne mancanti. Su una
-- tabella gia' esistente aggiungerebbe email_address vuota lasciando email
-- popolata; dopo il deploy la sincronizzazione scriverebbe su una colonna che
-- non c'e' e fallirebbe per intero. RENAME invece porta con se' i dati.
--
-- Idempotente: la seconda esecuzione non trova piu' le colonne vecchie e non
-- fa nulla.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN email TO email_address;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN phone TO phone_number;
  END IF;
END $$;

-- Gli indici seguono la colonna rinominata ma conservano il vecchio nome: senza
-- questo, alla prossima DDL ne verrebbe creato un secondo identico.
ALTER INDEX IF EXISTS idx_customers_email RENAME TO idx_customers_email_address;
ALTER INDEX IF EXISTS idx_customers_phone RENAME TO idx_customers_phone_number;

-- Senza il reload l'API REST continua a rispondere con lo schema di prima.
NOTIFY pgrst, 'reload schema';

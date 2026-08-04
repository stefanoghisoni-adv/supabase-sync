-- Il nome del piano su un negozio deve venire dal listino, non da chi lo
-- digita: due foreign key verso plans.plan_name.
--
-- Cosa cambia nell'editor di Supabase: la cella current_plan smette di essere
-- un campo di testo libero e diventa un selettore che elenca le righe di plans.
-- Un refuso non passa piu': Postgres rifiuta la scrittura.
--
-- Perche' non un ENUM come authorization_state: i valori di un enum stanno nel
-- tipo, non in una tabella. Aggiungere un piano vorrebbe dire ALTER TYPE, e i
-- prezzi e i limiti resterebbero comunque in plans. Con la foreign key l'elenco
-- e' il listino stesso, sempre allineato.
--
-- ON UPDATE CASCADE su entrambe: rinominare un piano in plans aggiorna da solo
-- tutti i negozi che ci stanno sopra. E' esattamente il caso che ha rotto le
-- ricerche per nome quando i piani sono passati alle iniziali maiuscole.
--
-- Idempotente: si puo' eseguire a mano sul database owner e poi di nuovo dalle
-- migrazioni senza effetti.

-- 1. Allinea i nomi gia' scritti sui negozi a quelli del listino. Tocca solo le
--    differenze di maiuscole e spazi: un nome che non corrisponde a nessun
--    piano non viene inventato, viene segnalato al passo 2.
UPDATE "shops" s
SET "current_plan" = p."plan_name"
FROM "plans" p
WHERE lower(trim(s."current_plan")) = lower(p."plan_name")
  AND s."current_plan" <> p."plan_name";

UPDATE "shops" s
SET "last_synced_plan" = p."plan_name"
FROM "plans" p
WHERE s."last_synced_plan" IS NOT NULL
  AND lower(trim(s."last_synced_plan")) = lower(p."plan_name")
  AND s."last_synced_plan" <> p."plan_name";

-- 2. Si ferma se qualche negozio ha un piano che nel listino non c'e'. Meglio un
--    errore leggibile adesso che una foreign key che fallisce senza dire quali
--    righe sono il problema. Se scatta: guardare quei negozi e decidere su che
--    piano metterli, poi rieseguire.
DO $$
DECLARE
  orfani TEXT;
BEGIN
  SELECT string_agg(DISTINCT s."current_plan", ', ')
  INTO orfani
  FROM "shops" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "plans" p WHERE p."plan_name" = s."current_plan"
  );

  IF orfani IS NOT NULL THEN
    RAISE EXCEPTION 'Piani non presenti in plans, usati da shops.current_plan: %', orfani;
  END IF;

  SELECT string_agg(DISTINCT s."last_synced_plan", ', ')
  INTO orfani
  FROM "shops" s
  WHERE s."last_synced_plan" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "plans" p WHERE p."plan_name" = s."last_synced_plan"
    );

  -- Qui non si blocca niente: last_synced_plan e' un dato storico, e un piano
  -- ritirato dal listino e' un caso normale. Si azzera, che e' come dire
  -- "nessuna sincronizzazione precedente di cui tenere conto".
  IF orfani IS NOT NULL THEN
    RAISE NOTICE 'shops.last_synced_plan azzerato dove citava piani non piu in listino: %', orfani;
    UPDATE "shops" s
    SET "last_synced_plan" = NULL
    WHERE s."last_synced_plan" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "plans" p WHERE p."plan_name" = s."last_synced_plan"
      );
  END IF;
END
$$;

-- 3. Il default 'free' scritto nella colonna non serve piu' e sarebbe una
--    trappola: sopravviverebbe a un rinomina del piano gratuito e finirebbe per
--    violare la foreign key su un'installazione nuova. Il piano iniziale lo
--    decide il codice leggendo il listino.
ALTER TABLE "shops" ALTER COLUMN "current_plan" DROP DEFAULT;

-- 4. Le foreign key. plans.plan_name e' gia' unico (indice plans_plan_name_key),
--    che e' il requisito per potervisi riferire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shops_current_plan_fkey'
  ) THEN
    ALTER TABLE "shops"
      ADD CONSTRAINT "shops_current_plan_fkey"
      FOREIGN KEY ("current_plan")
      REFERENCES "plans"("plan_name")
      -- RESTRICT: un piano in uso non si cancella per sbaglio, lasciando negozi
      -- senza piano valido. Prima si spostano i negozi, poi si ritira il piano.
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shops_last_synced_plan_fkey'
  ) THEN
    ALTER TABLE "shops"
      ADD CONSTRAINT "shops_last_synced_plan_fkey"
      FOREIGN KEY ("last_synced_plan")
      REFERENCES "plans"("plan_name")
      -- SET NULL: e' un dato storico, non un vincolo di funzionamento. Se il
      -- piano sparisce dal listino vale "nessuna sincronizzazione precedente".
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

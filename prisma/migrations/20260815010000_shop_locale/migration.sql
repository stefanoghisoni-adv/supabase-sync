-- Lingua scelta dal merchant in Impostazioni.
--
-- null = si segue la lingua del suo admin Shopify, che e' il comportamento
-- normale. La colonna serve solo a chi vuole un'altra cosa.
--
-- Additiva: colonna nuova, nullable, nessun dato toccato.

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "locale" TEXT;

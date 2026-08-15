-- L'ultima lingua che Shopify ci ha dichiarato per l'admin di questo negozio.
--
-- Shopify la manda in coda alla URL a ogni apertura dell'app, ma non alle
-- navigazioni interne: senza ricordarla, a meta' sessione l'app cambierebbe
-- lingua da sola.
--
-- Additiva: colonna nuova, nullable, nessun dato toccato.

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "detected_locale" TEXT;

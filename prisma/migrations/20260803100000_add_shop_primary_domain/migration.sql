-- Dominio principale del negozio: quello su cui navigano i clienti, che puo'
-- essere diverso dal <negozio>.myshopify.com con cui l'app lo identifica.
--
-- Si riempie da solo alla prima apertura dell'app e si ricontrolla a ogni
-- apertura successiva: un negozio che collega un dominio proprio, o lo cambia,
-- si allinea senza che nessuno debba intervenire.
--
-- Idempotente: si puo' eseguire a mano sul database owner (il pooler sulla 6543
-- non esegue DDL) e poi di nuovo dalle migrazioni senza effetti.

ALTER TABLE "shops"
  ADD COLUMN IF NOT EXISTS "primary_domain" TEXT;

-- Valuta scelta dal merchant, separata dalla lingua: prima le due erano una
-- scelta sola e stavano insieme in "locale".
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "preferred_currency" TEXT;

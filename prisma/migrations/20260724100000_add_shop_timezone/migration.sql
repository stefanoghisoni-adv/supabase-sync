-- Fuso orario IANA del negozio, usato per formattare le date del log in modo
-- deterministico. IF NOT EXISTS: idempotente anche se applicata a mano.
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "iana_timezone" TEXT;

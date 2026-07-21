-- AlterTable
-- IF NOT EXISTS: le colonne sono state applicate a mano via SQL editor sul DB
-- owner di produzione (il pooler sulla 6543 non esegue DDL), quindi questa
-- migration deve essere un no-op la' e creare le colonne altrove.
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "read_proxy_token_hash" TEXT;
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "read_proxy_token_enc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shops_read_proxy_token_hash_key" ON "shops"("read_proxy_token_hash");

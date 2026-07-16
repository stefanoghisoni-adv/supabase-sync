-- CreateTable
CREATE TABLE "supabase_oauth_tokens" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supabase_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supabase_oauth_tokens_shop_id_key" ON "supabase_oauth_tokens"("shop_id");

-- AddForeignKey
ALTER TABLE "supabase_oauth_tokens" ADD CONSTRAINT "supabase_oauth_tokens_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

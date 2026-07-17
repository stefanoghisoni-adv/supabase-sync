-- Shop authorization gate (ENABLED / PENDING / DISABLED)
ALTER TABLE "shops" ADD COLUMN "authorization" TEXT NOT NULL DEFAULT 'ENABLED';

-- Trial days limit per plan (null = no limit)
ALTER TABLE "plans" ADD COLUMN "trial_days" INTEGER;

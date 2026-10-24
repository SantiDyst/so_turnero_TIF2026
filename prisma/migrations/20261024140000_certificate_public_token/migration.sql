-- AlterTable: opaque token for the public certificate link.
ALTER TABLE "Certificado" ADD COLUMN "token" TEXT;

-- Backfill existing certificates with a 256-bit random token (two UUIDs = 64 hex chars).
UPDATE "Certificado"
SET "token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "token" IS NULL;

ALTER TABLE "Certificado" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_token_key" ON "Certificado"("token");

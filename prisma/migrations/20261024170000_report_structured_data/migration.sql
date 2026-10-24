-- AlterTable
ALTER TABLE "Informe" ADD COLUMN     "datos" JSONB,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

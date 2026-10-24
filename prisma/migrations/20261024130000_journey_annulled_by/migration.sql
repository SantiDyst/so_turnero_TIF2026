-- AlterTable
ALTER TABLE "Recorrido" ADD COLUMN     "anuladoPorId" TEXT;

-- CreateIndex
CREATE INDEX "Recorrido_anuladoPorId_idx" ON "Recorrido"("anuladoPorId");

-- AddForeignKey
ALTER TABLE "Recorrido" ADD CONSTRAINT "Recorrido_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

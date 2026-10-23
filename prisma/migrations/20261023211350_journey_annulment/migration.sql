-- AlterEnum
ALTER TYPE "RecorridoEstado" ADD VALUE 'Anulada';

-- AlterTable
ALTER TABLE "Recorrido" ADD COLUMN     "anuladaAt" TIMESTAMP(3),
ADD COLUMN     "motivoAnulacion" TEXT,
ALTER COLUMN "numeroAtencion" DROP DEFAULT;

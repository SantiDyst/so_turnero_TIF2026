-- Migration A: additive circuit foundation.
-- Creates the circuit enums and tables, adds nullable link columns, and backfills
-- the specialty on existing attention and professional rows. Tightening (NOT NULL)
-- and unique indexes land in the following migration.

-- CreateEnum
CREATE TYPE "Especialidad" AS ENUM ('BIOQUIMICA', 'CLINICA_MEDICA', 'PSICOLOGIA');
CREATE TYPE "EvaluacionEstado" AS ENUM ('PENDIENTE', 'COMPLETA');
CREATE TYPE "ReservaEstado" AS ENUM ('RESERVADA', 'CUMPLIDA', 'CANCELADA', 'REPROGRAMADA', 'AUSENTE');
CREATE TYPE "ResultadoEspecialidad" AS ENUM ('APTO_PLENO', 'APTO_CONDICIONAL', 'NO_APTO');

-- AddEnumValue
ALTER TYPE "RecorridoEstado" ADD VALUE 'Cierre final';

-- Specialty: nullable until migration B, then backfilled. Every existing
-- professional becomes CLINICA_MEDICA; the specialty stays required for new rows.
ALTER TABLE "Profesional" ADD COLUMN "especialidad" "Especialidad";
UPDATE "Profesional" SET "especialidad" = 'CLINICA_MEDICA';

-- Specialty: free text -> enum. Keep the original values under a temporary
-- column so the case-insensitive backfill can inspect them. Unrecognized values
-- (including "Clinical" and "Occupational medicine") fall back to CLINICA_MEDICA.
ALTER TABLE "Atencion" RENAME COLUMN "especialidad" TO "especialidad_legacy";
ALTER TABLE "Atencion" ADD COLUMN "especialidad" "Especialidad";
UPDATE "Atencion"
SET "especialidad" = CASE
    WHEN lower("especialidad_legacy") LIKE '%bioquimica%' THEN 'BIOQUIMICA'::"Especialidad"
    WHEN lower("especialidad_legacy") LIKE '%laboratorio%' THEN 'BIOQUIMICA'::"Especialidad"
    WHEN lower("especialidad_legacy") LIKE '%psicolog%' THEN 'PSICOLOGIA'::"Especialidad"
    ELSE 'CLINICA_MEDICA'::"Especialidad"
END;

-- Nullable circuit links on the existing attention aggregate.
ALTER TABLE "Atencion" ADD COLUMN "evaluacionId" TEXT;
ALTER TABLE "Atencion" ADD COLUMN "atencionOrigenId" TEXT;
ALTER TABLE "Atencion" ADD COLUMN "recitacionId" TEXT;

-- CreateTable
CREATE TABLE "Evaluacion" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "especialidad" "Especialidad" NOT NULL,
    "estado" "EvaluacionEstado" NOT NULL DEFAULT 'PENDIENTE',
    "resultado" "ResultadoEspecialidad",
    "completadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pendiente" (
    "id" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "atencionOrigenId" TEXT,
    "motivo" TEXT NOT NULL,
    "fechaLimite" TIMESTAMP(3),
    "resueltoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recitacion" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "pendienteId" TEXT NOT NULL,
    "reservaId" TEXT,
    "especialidad" "Especialidad" NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "recitacionId" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "estado" "ReservaEstado" NOT NULL DEFAULT 'RESERVADA',
    "reservaAnteriorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Derivacion" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "atencionOrigenId" TEXT NOT NULL,
    "especialidadDestino" "Especialidad" NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Derivacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoAptitud" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "resultadoClinico" "ResultadoEspecialidad" NOT NULL,
    "resultadoPsicologico" "ResultadoEspecialidad" NOT NULL,
    "aptitudFinal" "ResultadoEspecialidad" NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResultadoAptitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Atencion_evaluacionId_idx" ON "Atencion"("evaluacionId");
CREATE INDEX "Atencion_recitacionId_idx" ON "Atencion"("recitacionId");
CREATE INDEX "Pendiente_evaluacionId_idx" ON "Pendiente"("evaluacionId");
CREATE INDEX "Pendiente_atencionOrigenId_idx" ON "Pendiente"("atencionOrigenId");
CREATE INDEX "Recitacion_recorridoId_idx" ON "Recitacion"("recorridoId");
CREATE INDEX "Recitacion_evaluacionId_idx" ON "Recitacion"("evaluacionId");
CREATE INDEX "Recitacion_pendienteId_idx" ON "Recitacion"("pendienteId");
CREATE INDEX "Reserva_profesionalId_idx" ON "Reserva"("profesionalId");
CREATE INDEX "Reserva_recitacionId_idx" ON "Reserva"("recitacionId");
CREATE INDEX "Reserva_estado_idx" ON "Reserva"("estado");
CREATE INDEX "Derivacion_recorridoId_idx" ON "Derivacion"("recorridoId");
CREATE INDEX "Derivacion_atencionOrigenId_idx" ON "Derivacion"("atencionOrigenId");

-- AddForeignKey
ALTER TABLE "Evaluacion" ADD CONSTRAINT "Evaluacion_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pendiente" ADD CONSTRAINT "Pendiente_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pendiente" ADD CONSTRAINT "Pendiente_atencionOrigenId_fkey" FOREIGN KEY ("atencionOrigenId") REFERENCES "Atencion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recitacion" ADD CONSTRAINT "Recitacion_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recitacion" ADD CONSTRAINT "Recitacion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recitacion" ADD CONSTRAINT "Recitacion_pendienteId_fkey" FOREIGN KEY ("pendienteId") REFERENCES "Pendiente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_recitacionId_fkey" FOREIGN KEY ("recitacionId") REFERENCES "Recitacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_reservaAnteriorId_fkey" FOREIGN KEY ("reservaAnteriorId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recitacion" ADD CONSTRAINT "Recitacion_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Derivacion" ADD CONSTRAINT "Derivacion_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Derivacion" ADD CONSTRAINT "Derivacion_atencionOrigenId_fkey" FOREIGN KEY ("atencionOrigenId") REFERENCES "Atencion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultadoAptitud" ADD CONSTRAINT "ResultadoAptitud_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_atencionOrigenId_fkey" FOREIGN KEY ("atencionOrigenId") REFERENCES "Atencion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_recitacionId_fkey" FOREIGN KEY ("recitacionId") REFERENCES "Recitacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

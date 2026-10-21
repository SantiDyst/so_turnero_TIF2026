-- Migration D: additive specialty reports and final certificate aggregates (RF-15/RF-16).
-- Requires migrations A-C. No backfill: both tables start empty.
--
-- Report anchoring: Informe is 1:1 with Evaluacion (evaluacionId is unique), so a
-- recitation attention updates the same report row. atencionId/profesionalId are
-- optional provenance/responsibility references and disappear with SetNull.
--
-- Certificate anchoring: Certificado is 1:1 with Recorrido; identificador stores
-- CERT-<numeroAtencion> and is unique. aptitudFinal is an immutable snapshot.

CREATE TYPE "InformeEstado" AS ENUM ('PENDIENTE', 'COMPLETO');

CREATE TABLE "Informe" (
    "id" TEXT NOT NULL,
    "evaluacionId" TEXT NOT NULL,
    "atencionId" TEXT,
    "profesionalId" TEXT,
    "observaciones" TEXT NOT NULL DEFAULT '',
    "estado" "InformeEstado" NOT NULL DEFAULT 'PENDIENTE',
    "completadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Informe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Certificado" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "aptitudFinal" "ResultadoEspecialidad" NOT NULL,
    "profesionalId" TEXT,
    "emitidoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Informe_evaluacionId_key" ON "Informe"("evaluacionId");
CREATE INDEX "Informe_atencionId_idx" ON "Informe"("atencionId");
CREATE INDEX "Informe_profesionalId_idx" ON "Informe"("profesionalId");

CREATE UNIQUE INDEX "Certificado_recorridoId_key" ON "Certificado"("recorridoId");
CREATE UNIQUE INDEX "Certificado_identificador_key" ON "Certificado"("identificador");
CREATE INDEX "Certificado_profesionalId_idx" ON "Certificado"("profesionalId");

ALTER TABLE "Informe" ADD CONSTRAINT "Informe_evaluacionId_fkey" FOREIGN KEY ("evaluacionId") REFERENCES "Evaluacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "Atencion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

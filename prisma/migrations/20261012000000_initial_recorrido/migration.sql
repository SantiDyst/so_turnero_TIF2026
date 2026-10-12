-- CreateEnum
CREATE TYPE "RecorridoEstado" AS ENUM ('En espera', 'En proceso');

-- CreateEnum
CREATE TYPE "AtencionEstado" AS ENUM ('No iniciada', 'En espera', 'En atención', 'Finalizada', 'Pendiente');

-- CreateEnum
CREATE TYPE "DisponibilidadProfesional" AS ENUM ('Disponible', 'Ocupado');

-- Attention numbers are monotonic and human-readable: AT- plus zero-padded digits
-- (minimum width 4: AT-0001). Gaps after a rolled-back transaction are acceptable.
CREATE SEQUENCE recorrido_attention_no_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- Renders the next attention number. Uses an explicit CASE instead of a fixed-width
-- to_char/lpad, because lpad truncates and to_char overflows to '#' once the value
-- passes 9999; both would break the AT-0001 / AT-10000 format the design requires.
CREATE FUNCTION next_attention_no() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    n bigint;
BEGIN
    n := nextval('recorrido_attention_no_seq');
    RETURN 'AT-' || CASE WHEN n >= 10000 THEN n::text ELSE lpad(n::text, 4, '0') END;
END;
$$;

-- CreateTable
CREATE TABLE "Postulante" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Postulante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recorrido" (
    "id" TEXT NOT NULL,
    "postulanteId" TEXT NOT NULL,
    "numeroAtencion" TEXT NOT NULL DEFAULT next_attention_no(),
    "estado" "RecorridoEstado" NOT NULL DEFAULT 'En espera',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recorrido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profesional" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "disponibilidad" "DisponibilidadProfesional" NOT NULL DEFAULT 'Disponible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Profesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atencion" (
    "id" TEXT NOT NULL,
    "recorridoId" TEXT NOT NULL,
    "postulanteId" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "estado" "AtencionEstado" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Atencion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recorrido_postulanteId_key" ON "Recorrido"("postulanteId");
CREATE UNIQUE INDEX "Recorrido_numeroAtencion_key" ON "Recorrido"("numeroAtencion");
CREATE INDEX "Atencion_recorridoId_idx" ON "Atencion"("recorridoId");
CREATE INDEX "Atencion_profesionalId_idx" ON "Atencion"("profesionalId");

CREATE UNIQUE INDEX atencion_one_active_per_applicant ON "Atencion" ("postulanteId") WHERE "estado" = 'En atención';

-- AddForeignKey
ALTER TABLE "Recorrido" ADD CONSTRAINT "Recorrido_postulanteId_fkey" FOREIGN KEY ("postulanteId") REFERENCES "Postulante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "Recorrido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_postulanteId_fkey" FOREIGN KEY ("postulanteId") REFERENCES "Postulante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Atencion" ADD CONSTRAINT "Atencion_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

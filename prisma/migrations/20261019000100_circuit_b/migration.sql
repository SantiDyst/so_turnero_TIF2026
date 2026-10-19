-- Migration B: tighten the circuit foundation.
-- Requires migration A's backfill. The existing partial unique index
-- atencion_one_active_per_applicant is intentionally left untouched.

-- Tighten backfilled specialties.
ALTER TABLE "Profesional" ALTER COLUMN "especialidad" SET NOT NULL;
ALTER TABLE "Atencion" ALTER COLUMN "especialidad" SET NOT NULL;
ALTER TABLE "Atencion" DROP COLUMN "especialidad_legacy";

-- One evaluation per journey and specialty.
CREATE UNIQUE INDEX "Evaluacion_recorridoId_especialidad_key" ON "Evaluacion"("recorridoId", "especialidad");

-- One stored aptitude per journey.
CREATE UNIQUE INDEX "ResultadoAptitud_recorridoId_key" ON "ResultadoAptitud"("recorridoId");

-- A recitation owns at most one current reservation.
CREATE UNIQUE INDEX "Recitacion_reservaId_key" ON "Recitacion"("reservaId");

-- One follow-up attention per recitation; recitation links stay optional.
CREATE UNIQUE INDEX "Atencion_recitacionId_key" ON "Atencion"("recitacionId") WHERE "recitacionId" IS NOT NULL;

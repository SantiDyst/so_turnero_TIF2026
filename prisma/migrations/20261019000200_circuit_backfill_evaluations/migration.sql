-- Backfill the three specialty evaluations for journeys created before the
-- evaluation aggregate existed. New registrations create them eagerly, but the
-- circuit invariant (one evaluation per journey and specialty) must also hold
-- for pre-existing rows.

INSERT INTO "Evaluacion" ("id", "recorridoId", "especialidad", "estado", "updatedAt")
SELECT
    gen_random_uuid()::text,
    r."id",
    s."especialidad",
    'PENDIENTE'::"EvaluacionEstado",
    CURRENT_TIMESTAMP
FROM "Recorrido" r
CROSS JOIN (
    VALUES
        ('BIOQUIMICA'::"Especialidad"),
        ('CLINICA_MEDICA'::"Especialidad"),
        ('PSICOLOGIA'::"Especialidad")
) AS s("especialidad")
WHERE r."estado" <> 'Cierre final'
  AND NOT EXISTS (
      SELECT 1
      FROM "Evaluacion" e
      WHERE e."recorridoId" = r."id"
        AND e."especialidad" = s."especialidad"
  );

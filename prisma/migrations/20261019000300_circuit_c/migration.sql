-- Migration C: protect the professional agenda from overlapping reservations.
-- Requires migration A (Reserva with timestamptz intervals).
--
-- btree_gist is required for the equality component ("profesionalId" WITH =) of
-- the exclusion constraint. If CREATE EXTENSION fails on a given server, the
-- application still serializes overlap detection with
-- pg_advisory_xact_lock(hashtext(profesionalId)) plus an overlap SELECT; see
-- docs/first-functional-run.md ("Agenda fallback").
--
-- Interval type note: Reserva.inicio/fin are timestamptz(3), so the range is
-- tstzrange (not tsrange, which is timestamp without time zone). The default
-- '[)' bounds keep adjacent slots from conflicting.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reserva"
    ADD CONSTRAINT "Reserva_profesional_no_overlap"
    EXCLUDE USING gist (
        "profesionalId" WITH =,
        tstzrange("inicio", "fin") WITH &&
    )
    WHERE ("estado" = 'RESERVADA');

-- =====================================================================
-- DRCH - Migration 10: Related-signal matching support
--
-- Enables fast, advisory "possibly the same event" suggestions for the
-- dispatcher signal queue (GET /api/v1/dm/signals/related):
--   1. source_signals.geom is always derived from latitude/longitude, so
--      every inserter (ingestion, seeds, tests) gets a usable PostGIS point.
--   2. Partial GiST / B-tree indexes over PENDING signals keep the
--      distance + time self-join cheap.
-- Idempotent: safe to re-run. Does not change any existing column or status.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_sync_signal_geom() RETURNS trigger AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_source_signals_sync_geom ON source_signals;
CREATE TRIGGER trg_source_signals_sync_geom
    BEFORE INSERT OR UPDATE OF latitude, longitude, geom ON source_signals
    FOR EACH ROW EXECUTE FUNCTION fn_sync_signal_geom();

-- Backfill rows written before this migration (e.g. inserted without geom).
UPDATE source_signals
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE geom IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_signals_pending_geom
    ON source_signals USING GIST (geom) WHERE status = 'PENDING' AND geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_signals_pending_created
    ON source_signals (created_at) WHERE status = 'PENDING';

-- =====================================================================
-- DRCH - Migration 11: Citizen photo attachment storage (NU-FR-05)
--
-- evidence_files (migration 01) holds the metadata and moderation state of
-- each upload but nowhere to keep the file itself. evidence_blobs stores the
-- bytes in PostgreSQL so photos survive redeploys and can be previewed by the
-- reporter and, later, by moderators. One row per evidence file; deleted with
-- it (ON DELETE CASCADE) and emptied when the citizen or a moderator removes
-- the file. Idempotent: safe to re-run. Changes no existing table or column.
-- =====================================================================

CREATE TABLE IF NOT EXISTS evidence_blobs (
    evidence_id UUID PRIMARY KEY REFERENCES evidence_files(evidence_id) ON DELETE CASCADE,
    content     BYTEA NOT NULL CHECK (octet_length(content) > 0)
);

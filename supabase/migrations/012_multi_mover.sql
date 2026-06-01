-- Multi-mover gig support
-- Allows multiple movers to be accepted per gig (up to crew_size)
-- The first accepted mover with a vehicle is the "lead"

ALTER TABLE gig_applications
  ADD COLUMN IF NOT EXISTS slots_claimed int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

-- Index for fast slot counting
CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_status
  ON gig_applications(gig_id, status);

-- Migration 048 — business intake jobs (simpler B2B intake; no business account yet)
--
-- A business submits a job (items + up to 4 stops) and offers a price. The
-- submit-business-job edge function recomputes a recommended price server-side
-- (base by job size + multi-stop distance + access surcharges), estimates the
-- duration, checks our calendar, and decides: accepted / countered / pending.
-- Inserts go through the edge fn (service role); admins review in the dashboard.

CREATE TABLE IF NOT EXISTS business_jobs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number                bigint,                       -- human-friendly id (seeded below)
  customer_name             text,
  customer_phone            text,
  customer_email            text,
  photo_urls                text[] DEFAULT '{}',
  stops                     jsonb  DEFAULT '[]',          -- [{addr,lat,lng,place}] up to 4, in order
  job_size                  text,                         -- reuse size tiers (Just a few items … 4+ BR)
  stairs                    boolean DEFAULT false,
  elevator                  boolean DEFAULT false,
  long_walk                 boolean DEFAULT false,
  access_notes              text,
  distance_miles            numeric,
  offered_price_cents       int,
  recommended_price_cents   int,
  counter_price_cents       int,
  estimated_duration_hours  numeric,
  requested_date            text,                         -- 'YYYY-MM-DD'
  requested_time            text,                         -- 'H:00 AM/PM'
  scheduled_for             timestamptz,
  decision                  text,                         -- 'accepted' | 'countered' | 'pending'
  decision_reason           text,
  status                    text DEFAULT 'new',           -- 'new' | 'booked' | 'declined'
  gig_id                    uuid,
  notes                     text,
  created_at                timestamptz DEFAULT now(),
  decided_at                timestamptz
);
CREATE INDEX IF NOT EXISTS business_jobs_status_idx ON business_jobs (status);
CREATE INDEX IF NOT EXISTS business_jobs_decision_idx ON business_jobs (decision);

-- Human-friendly auto-incrementing job number (starts at 5001 to avoid clashing
-- with consumer lead_number which starts at 1001).
CREATE SEQUENCE IF NOT EXISTS business_job_number_seq START 5001;
CREATE OR REPLACE FUNCTION public.set_business_job_number()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := nextval('business_job_number_seq');
  END IF;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS trg_business_job_number ON business_jobs;
CREATE TRIGGER trg_business_job_number BEFORE INSERT ON business_jobs
  FOR EACH ROW EXECUTE FUNCTION set_business_job_number();

-- RLS: admin-only. The submit-business-job edge fn uses the service role (bypasses
-- RLS) to insert; the anon key has no direct read/write on this table.
ALTER TABLE business_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage business jobs" ON business_jobs;
CREATE POLICY "Admins manage business jobs" ON business_jobs
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

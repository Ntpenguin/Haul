-- Migration 052 — make booked business jobs block calendar slots too.
--
-- get_booked_slots(date) previously returned only paid consumer leads + admin
-- blocked slots. Booked business jobs (business.html → submit-business-job) weren't
-- counted, so both forms could double-book over a booked business job. Add them.
-- Still SECURITY DEFINER + returns no PII (only the time + a size label).

CREATE OR REPLACE FUNCTION get_booked_slots(p_date text)
RETURNS TABLE (
  preferred_time text,
  items_size     text,
  stairs_pickup  text,
  stairs_dropoff text,
  parking        text,
  special_items  text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $func$
  SELECT qr.preferred_time, qr.items_size, qr.stairs_pickup, qr.stairs_dropoff, qr.parking, qr.special_items
  FROM quote_requests qr
  WHERE qr.preferred_date = p_date
    AND qr.preferred_time IS NOT NULL AND qr.preferred_time <> ''

  UNION ALL

  SELECT bs.blocked_time, '4+ BR / full house', NULL, NULL, NULL, NULL
  FROM blocked_slots bs
  WHERE bs.blocked_date = p_date

  UNION ALL

  SELECT bj.requested_time, bj.job_size, NULL, NULL, NULL, NULL
  FROM business_jobs bj
  WHERE bj.requested_date = p_date
    AND bj.status = 'booked'
    AND bj.requested_time IS NOT NULL AND bj.requested_time <> '';
$func$;

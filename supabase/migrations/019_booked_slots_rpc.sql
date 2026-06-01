-- RPC to return booked time slots for a given date (no PII exposed)
-- Called by the intake form (anon role) to gray out already-booked hours
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
AS $$
  SELECT
    qr.preferred_time,
    qr.items_size,
    qr.stairs_pickup,
    qr.stairs_dropoff,
    qr.parking,
    qr.special_items
  FROM quote_requests qr
  WHERE qr.preferred_date = p_date
    AND qr.preferred_time IS NOT NULL
    AND qr.preferred_time <> ''
$$;

-- Allow anon to call this function
GRANT EXECUTE ON FUNCTION get_booked_slots(text) TO anon;
GRANT EXECUTE ON FUNCTION get_booked_slots(text) TO authenticated;

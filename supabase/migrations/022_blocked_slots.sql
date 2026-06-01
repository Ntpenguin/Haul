-- Manual time blocks set by admin
CREATE TABLE IF NOT EXISTS blocked_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date text NOT NULL,
  blocked_time text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Only authenticated (admin) can manage
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blocked slots"
  ON blocked_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update the RPC to include blocked slots as "booked"
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

  UNION ALL

  SELECT
    bs.blocked_time AS preferred_time,
    '4+ BR / full house' AS items_size,
    NULL AS stairs_pickup,
    NULL AS stairs_dropoff,
    NULL AS parking,
    NULL AS special_items
  FROM blocked_slots bs
  WHERE bs.blocked_date = p_date
$$;

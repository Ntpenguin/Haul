-- Quote requests from the landing page intake form
CREATE TABLE IF NOT EXISTS quote_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text,
  phone                text,
  email                text,
  service_type         text,
  preferred_date       text,
  preferred_time       text,
  pickup_address       text,
  pickup_place_type    text,
  dropoff_address      text,
  dropoff_place_type   text,
  items_size           text,
  items_list           text,
  stairs_pickup        text,
  stairs_dropoff       text,
  parking              text,
  special_items        text[],
  items_boxed          text,
  prep_needed          text[],
  other_notes          text,
  photo_urls           text[],
  estimated_price_cents integer,
  answers              jsonb,
  notes                jsonb,
  created_at           timestamptz DEFAULT now()
);

-- Allow anonymous inserts from the intake form
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a quote request"
  ON quote_requests FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Admins can read quote requests"
  ON quote_requests FOR SELECT
  TO authenticated
  USING (true);

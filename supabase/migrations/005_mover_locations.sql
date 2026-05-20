CREATE TABLE mover_locations (
  mover_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mover_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mover can manage own location" ON mover_locations FOR ALL USING (auth.uid() = mover_id);
CREATE POLICY "Customer can read mover location for their gig" ON mover_locations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM gigs WHERE gigs.id = mover_locations.gig_id AND gigs.customer_id = auth.uid()
  ));

-- Enable realtime on this table
ALTER PUBLICATION supabase_realtime ADD TABLE mover_locations;

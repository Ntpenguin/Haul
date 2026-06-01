-- Messages table (create if missing — may already exist)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_gig_id ON messages(gig_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(gig_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Parties of the gig can read messages
DO $$ BEGIN
  CREATE POLICY "Gig parties can read messages" ON messages FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM gigs
        WHERE gigs.id = messages.gig_id
          AND (gigs.customer_id = auth.uid() OR gigs.mover_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM gig_applications
        WHERE gig_applications.gig_id = messages.gig_id
          AND gig_applications.mover_id = auth.uid()
          AND gig_applications.status = 'accepted'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parties can insert messages
DO $$ BEGIN
  CREATE POLICY "Gig parties can send messages" ON messages FOR INSERT
    WITH CHECK (
      auth.uid() = sender_id
      AND (
        EXISTS (
          SELECT 1 FROM gigs
          WHERE gigs.id = messages.gig_id
            AND (gigs.customer_id = auth.uid() OR gigs.mover_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM gig_applications
          WHERE gig_applications.gig_id = messages.gig_id
            AND gig_applications.mover_id = auth.uid()
            AND gig_applications.status = 'accepted'
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

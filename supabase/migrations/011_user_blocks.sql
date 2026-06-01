-- User block list (required for App Store/Play Store compliance)
CREATE TABLE user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own block list
CREATE POLICY "Users can manage own blocks" ON user_blocks
  FOR ALL USING (auth.uid() = blocker_id);

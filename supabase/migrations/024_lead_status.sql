-- Add status column to quote_requests for tracking lead lifecycle
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Add completed_at timestamp
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Auto-incrementing lead number for easy reference
CREATE SEQUENCE IF NOT EXISTS lead_number_seq START 1001;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS lead_number integer DEFAULT nextval('lead_number_seq');

-- Backfill existing rows (ordered by created_at)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) + 1000 AS rn
  FROM quote_requests
  WHERE lead_number IS NULL
)
UPDATE quote_requests
SET lead_number = numbered.rn
FROM numbered
WHERE quote_requests.id = numbered.id;

-- Update sequence to continue after last used number
SELECT setval('lead_number_seq', COALESCE((SELECT MAX(lead_number) FROM quote_requests), 1000));

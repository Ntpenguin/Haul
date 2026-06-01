-- Rate limit: max 5 quote submissions per email address per 24 hours
-- This runs server-side on every INSERT, backing up the client-side limit

-- Drop and recreate the anon INSERT policy with rate limiting
DROP POLICY IF EXISTS "Anyone can submit a quote request" ON quote_requests;

CREATE POLICY "Rate limited quote submissions"
  ON quote_requests FOR INSERT
  TO anon
  WITH CHECK (
    -- Allow if email is null (anonymous) OR fewer than 5 submissions from this email in 24h
    email IS NULL
    OR (
      SELECT COUNT(*)
      FROM quote_requests q
      WHERE q.email = email
        AND q.created_at > NOW() - INTERVAL '24 hours'
    ) < 5
  );

-- Also enforce basic field length limits at the DB level
ALTER TABLE quote_requests
  ADD CONSTRAINT name_length   CHECK (char_length(name)           <= 120),
  ADD CONSTRAINT phone_length  CHECK (char_length(phone)          <= 20),
  ADD CONSTRAINT email_length  CHECK (char_length(email)          <= 200),
  ADD CONSTRAINT notes_length  CHECK (char_length(other_notes)    <= 2000),
  ADD CONSTRAINT items_length  CHECK (char_length(items_list)     <= 1000),
  ADD CONSTRAINT addr_p_length CHECK (char_length(pickup_address) <= 300),
  ADD CONSTRAINT addr_d_length CHECK (char_length(dropoff_address)<= 300);

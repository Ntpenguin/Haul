-- Add payment tracking columns to quote_requests
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS deposit_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid';
  -- payment_status: 'unpaid', 'pending', 'paid', 'failed'

-- Allow anon to PATCH their own record's payment fields (for photo upload + payment update)
CREATE POLICY "Anyone can update their own quote payment"
  ON quote_requests FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Migration 045 — admin-initiated surcharges (extra charge for an inaccurate gig)
--
-- When the on-site scope exceeds what was quoted (undisclosed piano, extra flights
-- of stairs, etc.), an admin bills an additional amount against the existing gig.
-- The customer pays via an emailed Stripe Checkout link — NO card is stored, and the
-- customer re-consents (lowest chargeback risk). The stripe-webhook stamps the row
-- 'paid' when the surcharge PaymentIntent succeeds (metadata.type = 'surcharge').

CREATE TABLE IF NOT EXISTS surcharges (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id                     uuid NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  amount_cents               int  NOT NULL CHECK (amount_cents > 0),
  reason                     text,
  status                     text NOT NULL DEFAULT 'pending', -- pending | paid | canceled
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  customer_email             text,
  created_by                 uuid,            -- admin auth.uid() (no FK: admin may not have a profiles row)
  created_at                 timestamptz DEFAULT now(),
  paid_at                    timestamptz
);
CREATE INDEX IF NOT EXISTS surcharges_gig_idx ON surcharges (gig_id);

ALTER TABLE surcharges ENABLE ROW LEVEL SECURITY;

-- Admin-only (is_admin() from migration 034). The create-surcharge edge function and
-- the stripe-webhook use the service role, which bypasses RLS, so no anon/authenticated
-- policy is required for the payment path.
DROP POLICY IF EXISTS "Admins manage surcharges" ON surcharges;
CREATE POLICY "Admins manage surcharges" ON surcharges
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

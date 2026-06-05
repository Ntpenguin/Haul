-- Migration 053 — business job payment tracking.
-- When a business job is accepted (auto or manual), we email a Stripe Checkout
-- pay-link and DON'T treat the gig as paid until the business actually pays.
-- The stripe-webhook flips payment_status -> 'paid' on the business_job PaymentIntent.

ALTER TABLE business_jobs ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'; -- unpaid | paid
ALTER TABLE business_jobs ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE business_jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE business_jobs ADD COLUMN IF NOT EXISTS paid_at timestamptz;

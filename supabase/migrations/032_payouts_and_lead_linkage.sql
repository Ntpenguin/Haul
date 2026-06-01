-- Migration 032 — 100%-upfront payment model + lead→gig linkage + soft-delete
--
-- Payment model: customers pay the full job price upfront through the app.
-- The platform keeps a service fee and pays the mover the remainder after the
-- job is complete (via Stripe Connect transfers — see transfer-to-mover fn).
--
-- Record keeping: intake-form leads (quote_requests) are kept forever. When a
-- lead is fully paid it is converted into a marketplace gig (movers can apply)
-- and linked via quote_requests.gig_id / gigs.quote_request_id. Deleted leads
-- are soft-deleted in place (deleted_at), never hard-deleted.

-- ─────────────────────────────────────────────────
-- gigs: payout tracking + lead linkage
-- ─────────────────────────────────────────────────
ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS quote_request_id uuid REFERENCES quote_requests(id),
  ADD COLUMN IF NOT EXISTS platform_fee_cents int,
  ADD COLUMN IF NOT EXISTS mover_payout_cents int,
  ADD COLUMN IF NOT EXISTS payout_status text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_at timestamptz;
-- payout_status: 'unpaid', 'pending', 'paid', 'failed'

-- Lead-sourced marketplace gigs have no in-app customer account, so allow a
-- null customer_id. Customer-created gigs still set it. RLS for customers keys
-- off customer_id = auth.uid(), so null-customer gigs simply never match those
-- policies (they are reached by movers via the "posted" / matched policies).
ALTER TABLE gigs ALTER COLUMN customer_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gigs_quote_request_id_key
  ON gigs(quote_request_id) WHERE quote_request_id IS NOT NULL;

-- ─────────────────────────────────────────────────
-- quote_requests: link to converted gig + soft-delete
-- ─────────────────────────────────────────────────
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS gig_id uuid REFERENCES gigs(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS quote_requests_gig_id_idx ON quote_requests(gig_id);
CREATE INDEX IF NOT EXISTS quote_requests_deleted_at_idx ON quote_requests(deleted_at);

-- ─────────────────────────────────────────────────
-- mover_profiles: Stripe Connect payout capability
-- (stripe_account_id + stripe_onboarding_complete already exist)
-- ─────────────────────────────────────────────────
ALTER TABLE mover_profiles
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS charges_enabled boolean DEFAULT false;

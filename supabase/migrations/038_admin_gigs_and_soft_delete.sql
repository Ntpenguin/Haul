-- Migration 038 — admin gig management: soft-delete + complete + full read
--
-- Context:
--   The admin dashboard (admin/index.html) logs in as a plain `authenticated`
--   user via the anon key. The gigs RLS from 001 only lets the OWNING customer
--   (auth.uid() = customer_id) or the MATCHED mover read/update a gig, plus
--   "posted"/"matched" are world-readable to authenticated. Lead-sourced gigs
--   have customer_id IS NULL, so an admin is neither owner nor mover and:
--     * cannot UPDATE a gig  -> "Complete" and "Delete" silently affect 0 rows
--     * cannot even SELECT a gig once it leaves posted/matched (e.g. completed),
--       so a just-completed gig would disappear from the dashboard entirely.
--
--   This migration gives admins (is_admin(), migration 034) full SELECT + UPDATE
--   on gigs, and adds a soft-delete column so the admin Delete button hides a gig
--   to a Deleted tab (recoverable) instead of permanently destroying a paid
--   booking and its payment/payout records.

-- Soft-delete marker (NULL = live). Mirrors quote_requests.deleted_at.
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS gigs_deleted_at_idx ON gigs(deleted_at);

-- Admins can see every gig regardless of status/ownership (additive to the
-- existing customer/mover policies — RLS policies are OR'd together).
DROP POLICY IF EXISTS "Admins can read gigs" ON gigs;
CREATE POLICY "Admins can read gigs"
  ON gigs FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admins can update any gig (mark completed, soft-delete via deleted_at, restore).
DROP POLICY IF EXISTS "Admins can update gigs" ON gigs;
CREATE POLICY "Admins can update gigs"
  ON gigs FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

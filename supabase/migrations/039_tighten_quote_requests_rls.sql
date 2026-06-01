-- Migration 039 — tighten quote_requests RLS to admins only (lead PII + data-loss hardening)
--
-- Fixes two policies whose NAME says "Admins" but whose predicate is USING (true),
-- which actually grants the action to EVERY authenticated user (any signed-up
-- customer or mover), not just admins:
--
--   * Migration 017 "Admins can read quote requests"   (SELECT) — exposes all
--     lead PII: name, phone, email, pickup/dropoff addresses, notes.
--   * Migration 021 "Admins can delete quote requests" (DELETE) — lets anyone
--     hard-delete leads (destructive data loss).
--
-- Both are re-created gated on the admin allow-list helper is_admin()
-- (migration 034), so they finally match their names.
--
-- Why this is safe (no regressions):
--   * Admins (rows in the `admins` table) keep full read + delete: is_admin() = true.
--   * The public intake form is anon and never reads/deletes leads — anon has no
--     SELECT/DELETE policy; all anon writes go through the save_quote_lead
--     SECURITY DEFINER RPC (migration 036).
--   * The React Native app never queries quote_requests — website leads convert
--     to gigs (stripe-webhook) and the app reads `gigs`.
--   * Edge functions (create-quote-payment, stripe-webhook) and the e2e cleanup
--     use the service-role key, which bypasses RLS — unaffected.
--   * The admin UPDATE policy (migration 037) needs target rows to be
--     SELECT-visible for the admin; is_admin() still provides that visibility, so
--     soft-delete / restore keeps working.
--
-- NOTE: the app deletes leads via soft-delete (quote_requests.deleted_at,
-- migrations 037/038), so this hard-DELETE policy is currently unused. It's kept
-- (admin-gated) for manual cleanup; drop it entirely if you never hard-delete.

-- ── SELECT (was migration 017) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read quote requests" ON quote_requests;

CREATE POLICY "Admins can read quote requests"
  ON quote_requests FOR SELECT
  TO authenticated
  USING (is_admin());

-- ── DELETE (was migration 021) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete quote requests" ON quote_requests;

CREATE POLICY "Admins can delete quote requests"
  ON quote_requests FOR DELETE
  TO authenticated
  USING (is_admin());

-- Migration 037 — let admins UPDATE quote_requests (fixes the admin "Delete Lead" button)
--
-- Problem this fixes:
--   The admin dashboard soft-deletes / restores leads by UPDATE-ing
--   quote_requests.deleted_at. Migration 036 dropped the only UPDATE policy on
--   the table (the anon "Anyone can update their own quote payment" policy), and
--   migration 021 only added a hard-DELETE policy — not UPDATE. So with no UPDATE
--   policy at all, RLS denies the soft-delete by default: the PATCH silently
--   affects 0 rows and the Delete/Restore buttons appear to "do nothing".
--
--   Note: anon writes still go exclusively through the save_quote_lead RPC
--   (migration 036). This policy only grants UPDATE to *admins* (is_admin()),
--   not to all authenticated users, so movers/customers can't tamper with leads.
--   authenticated already has SELECT USING(true) on this table (migration 017),
--   so the UPDATE has the row visibility PostgreSQL requires.

CREATE POLICY "Admins can update quote requests"
  ON quote_requests FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

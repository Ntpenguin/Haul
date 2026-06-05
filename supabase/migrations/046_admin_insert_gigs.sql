-- Migration 046 — let admins INSERT gigs (manual/custom gig entry from the dashboard)
--
-- gigs RLS (001) only lets the owning customer create a gig (WITH CHECK auth.uid() =
-- customer_id), so an admin creating a gig — especially one with customer_id NULL —
-- was blocked. Admin read (038) + update (038) already exist; this adds INSERT.

DROP POLICY IF EXISTS "Admins can insert gigs" ON gigs;
CREATE POLICY "Admins can insert gigs" ON gigs
  FOR INSERT TO authenticated WITH CHECK (is_admin());

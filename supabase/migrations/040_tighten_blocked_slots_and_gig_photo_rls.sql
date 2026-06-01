-- Migration 040 — tighten two more RLS policies that were effectively open to
-- every authenticated user (same root cause as migration 039: USING (true)).

-- ── blocked_slots (was migration 022) ─────────────────────────────────────────
-- "Admins can manage blocked slots" used FOR ALL ... USING (true) WITH CHECK (true),
-- so ANY authenticated user (any customer or mover) could insert / edit / delete
-- the admin's calendar blocks. Gate it on the admin allow-list is_admin()
-- (migration 034).
--
-- No regression: the public intake reads booked slots via the get_booked_slots
-- SECURITY DEFINER RPC (which bypasses RLS), and the admin dashboard logs in as an
-- allow-listed admin (is_admin() = true), so it keeps full manage access.
DROP POLICY IF EXISTS "Admins can manage blocked slots" ON blocked_slots;

CREATE POLICY "Admins can manage blocked slots"
  ON blocked_slots FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── gig-photos storage UPDATE (was migration 013) ─────────────────────────────
-- "Authenticated users update gig photos" let ANY authenticated user overwrite
-- ANY object in the gig-photos bucket. Scope it to the uploader via
-- storage.objects.owner (set to the uploader's uid on INSERT). Photo uploads use
-- unique filenames so replace is rarely exercised, but scope it regardless.
DROP POLICY IF EXISTS "Authenticated users update gig photos" ON storage.objects;

CREATE POLICY "Authenticated users update gig photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'gig-photos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'gig-photos' AND owner = auth.uid());

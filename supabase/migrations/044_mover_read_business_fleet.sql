-- Migration 044 — let a mover read their own employer + fleet (for the app).
-- Additive SELECT policies (OR'd with the admin FOR ALL policies from 043).
-- A mover can read the business they belong to, and any fleet vehicle assigned to
-- them or owned by their business. Admins keep full access; other users get nothing.

DROP POLICY IF EXISTS "Mover reads own business" ON businesses;
CREATE POLICY "Mover reads own business" ON businesses
  FOR SELECT TO authenticated
  USING (id IN (SELECT business_id FROM mover_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Mover reads own and fleet vehicles" ON fleet_vehicles;
CREATE POLICY "Mover reads own and fleet vehicles" ON fleet_vehicles
  FOR SELECT TO authenticated
  USING (
    assigned_mover_id = auth.uid()
    OR business_id IN (SELECT business_id FROM mover_profiles WHERE id = auth.uid())
  );

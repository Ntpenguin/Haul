-- Migration 043 — businesses (employer orgs), worker→employer link, and fleet vehicles
--
-- A "business" is an admin-managed org record (no login). A worker (mover_profiles)
-- may belong to ONE business or none. A business owns a fleet of vehicles, each of
-- which may optionally be assigned to one of its workers.
--
-- Admin-managed only (is_admin() gate, migration 034). Also folds in the missing
-- migration 016 column (vehicle_make_model) so you don't need to run 016 separately.

ALTER TABLE mover_profiles ADD COLUMN IF NOT EXISTS vehicle_make_model text;

-- ── businesses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_email text,
  contact_phone text,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

-- ── worker -> employer (nullable: a worker can be independent) ─────────────────
ALTER TABLE mover_profiles
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mover_profiles_business_idx ON mover_profiles (business_id);

-- ── fleet vehicles owned by a business, optionally assigned to a worker ────────
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vehicle_type      text,            -- e.g. Pickup truck / Cargo van / Box truck
  make              text,
  model             text,
  year              int,
  license_plate     text,
  assigned_mover_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_vehicles_business_idx ON fleet_vehicles (business_id);

-- ── RLS: admin-managed only ───────────────────────────────────────────────────
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage businesses" ON businesses;
CREATE POLICY "Admins manage businesses" ON businesses
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage fleet vehicles" ON fleet_vehicles;
CREATE POLICY "Admins manage fleet vehicles" ON fleet_vehicles
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

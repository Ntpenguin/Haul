-- Store specific vehicle make/model for movers
ALTER TABLE mover_profiles
  ADD COLUMN IF NOT EXISTS vehicle_make_model text;

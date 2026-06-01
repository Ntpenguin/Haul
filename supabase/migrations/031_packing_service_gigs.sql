-- 031_packing_service_gigs.sql
-- Adds the optional packing-service add-on to gigs (the app wizard).
-- Packing = crew brings boxes, materials & labor and packs everything for the customer.
-- Priced as a +25% surcharge on the move base (see PACKING_SURCHARGE_PERCENT in lib/pricing.ts).
-- Mirrors the intake form's packing_service on quote_requests (migration 030).

ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS packing_service boolean NOT NULL DEFAULT false;

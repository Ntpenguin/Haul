-- 029_stair_flights.sql
-- Adds the number of flights of stairs at pickup / drop-off captured on the intake
-- form access step (Q7) when the customer selects "Stairs" or "Both".
-- Each flight adds a stairs surcharge (STAIRS_SURCHARGE = $30/flight) folded into
-- estimated_price_cents. NULL when that location has no stairs.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS flights_pickup  integer,
  ADD COLUMN IF NOT EXISTS flights_dropoff integer;

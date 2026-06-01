-- 030_packing_service.sql
-- Whether the customer opted into the full packing service (boxes, materials & labor)
-- on the intake form "Anything else?" step (Q8). Only offered when items_boxed = 'Not yet'.
-- When true, a +25% of move base packing surcharge is folded into estimated_price_cents.
-- Previously this was auto-applied whenever items_boxed = 'Not yet'; it is now an
-- explicit, customer-toggleable opt-in (defaults on).

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS packing_service boolean NOT NULL DEFAULT false;

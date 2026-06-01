-- 027_box_count.sql
-- Adds optional box count captured on the intake form "Anything else?" step (Q8)
-- when the customer says their items are all boxed. Informational only — helps the
-- crew plan; does NOT affect pricing.
-- Packing service (when items are "Not yet" boxed) is a +25% surcharge derived from
-- items_boxed = 'Not yet' and folded into estimated_price_cents — no separate column needed.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS box_count integer;

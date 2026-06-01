-- 026_common_items.sql
-- Adds an optional structured count of common household items (couches, beds, dressers, etc.)
-- captured on the intake form Q5. Informational only — used to size crew/truck and for dispatch.
-- Does NOT affect pricing (move-size base already accounts for typical furniture volume).
-- Stored like special_items: a flat array with repeats, e.g. ['Bed','Bed','Couch / sofa'] for 2 beds + 1 couch.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS common_items text[];

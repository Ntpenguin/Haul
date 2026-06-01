-- 028_common_item_details.sql
-- Adds optional per-common-item handling attributes captured on the intake form
-- photos step (Q6) when a common item count is at least 1. Informational only —
-- helps the crew plan equipment/labor; does NOT affect pricing.
-- Shape: { "Bed": ["Needs disassembly","Needs wrapping"], "Refrigerator": ["Heavy (250lb+)"] }

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS common_item_details jsonb;

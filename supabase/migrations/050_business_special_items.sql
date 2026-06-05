-- Migration 050 — special/heavy items on business jobs.
-- The business form now has a special-items checklist (Piano, Safe, Pool table, …)
-- like the consumer form; store the selections so the admin can see them and so
-- the recommended price reflects them.

ALTER TABLE business_jobs ADD COLUMN IF NOT EXISTS special_items text[] DEFAULT '{}';

-- Migration 033 — abandonment tracking
--
-- Capture WHERE a person stopped if they start but never finish.
--   quote_requests.progress_step : last step reached on the web intake form
--   gigs.draft_step              : last step reached in the in-app gig wizard
--
-- Lead lifecycle (quote_requests.status):
--   'incomplete' — started the form, autosaved, then abandoned  → Leads tab
--   'submitted'  — completed the form, reached payment           → out of Leads
--   'paid'/'booked' — paid; converted to a gig                   → Gigs tab
-- (legacy default was 'active'; rows keep working — admin treats
--  non-'incomplete' / paid rows as completed.)

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS progress_step text;

ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS draft_step text;

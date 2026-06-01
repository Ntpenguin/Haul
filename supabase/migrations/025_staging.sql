-- 025_staging.sql
-- Adds optional home-staging add-on to gigs and quote requests.
-- Staging = crew arranges/styles existing furniture (occupied-home staging).
-- Priced as a +30% surcharge on the move base (see STAGING_SURCHARGE_PERCENT in lib/pricing.ts).

ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS staging boolean NOT NULL DEFAULT false;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS staging boolean NOT NULL DEFAULT false;

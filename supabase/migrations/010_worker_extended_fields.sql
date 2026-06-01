-- Extended worker profile fields (selfie, skills, experience, address, account type)
ALTER TABLE mover_profiles
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS years_experience int,
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS account_type text CHECK (account_type IN ('independent', 'business')) DEFAULT 'independent',
  ADD COLUMN IF NOT EXISTS business_name text;

-- Phase tagging for gig photos (inspection / loading / dropoff)
ALTER TABLE gig_photos
  ADD COLUMN IF NOT EXISTS phase text CHECK (phase IN ('inspection', 'loading', 'dropoff', 'item'));

-- Allow the matched mover to upload job-phase photos
CREATE POLICY "Matched mover can insert job photos" ON gig_photos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM gigs
    WHERE gigs.id = gig_photos.gig_id
      AND gigs.mover_id = auth.uid()
      AND gigs.status IN ('matched', 'in_progress', 'completed')
  ));

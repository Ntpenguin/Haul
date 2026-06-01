-- Fix gig-photos storage bucket + RLS policies
-- Run this in the Supabase SQL editor

-- ── 1. Create the storage bucket (public so URLs work without auth) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('gig-photos', 'gig-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 2. Storage object policies ──

-- Anyone can read (bucket is public; explicit policy for completeness)
DO $$ BEGIN
  CREATE POLICY "Gig photos public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'gig-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated users can upload
DO $$ BEGIN
  CREATE POLICY "Authenticated users upload gig photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'gig-photos' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated users can replace (upsert-style re-uploads)
DO $$ BEGIN
  CREATE POLICY "Authenticated users update gig photos"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'gig-photos' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Fix gig_photos table RLS ──

-- Drop old restrictive SELECT + INSERT policies
DROP POLICY IF EXISTS "Photos follow gig access" ON gig_photos;
DROP POLICY IF EXISTS "Customer can insert photos on own gig" ON gig_photos;
DROP POLICY IF EXISTS "Matched mover can insert job photos" ON gig_photos;

-- SELECT: any authenticated user can read photo metadata
-- (actual image bytes are protected by storage; the URL metadata is not sensitive)
CREATE POLICY "Authenticated users can read gig photos"
  ON gig_photos FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: customer on their own gig
CREATE POLICY "Customer can insert photos on own gig"
  ON gig_photos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM gigs
    WHERE gigs.id = gig_photos.gig_id
      AND gigs.customer_id = auth.uid()
  ));

-- INSERT: any accepted mover (not just the lead)
CREATE POLICY "Accepted mover can insert job photos"
  ON gig_photos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM gig_applications
    WHERE gig_applications.gig_id = gig_photos.gig_id
      AND gig_applications.mover_id = auth.uid()
      AND gig_applications.status = 'accepted'
  ));

-- DELETE: customer on their own gig (keep existing behaviour)
-- "Customer can delete photos on own gig" already exists — leave it.

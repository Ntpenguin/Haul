-- Add category, title, and voice-input description to gigs
ALTER TABLE gigs
  ADD COLUMN gig_category text NOT NULL DEFAULT 'moving',
  ADD COLUMN gig_title text,
  ADD COLUMN gig_description text;

-- Store per-user category color preferences on profiles
ALTER TABLE profiles
  ADD COLUMN category_colors jsonb DEFAULT '{"moving":"#F59E0B","cleaning":"#3B82F6","landscaping":"#22C55E","auto":"#F97316"}';

-- Fast Fix Work — Initial database schema
-- Run this migration against your Supabase project

-- ─────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('customer', 'mover', 'both')) DEFAULT 'customer',
  full_name text,
  phone text UNIQUE,
  email text,
  avatar_url text,
  rating numeric(2,1),
  total_gigs int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, email)
  VALUES (NEW.id, NEW.phone, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS: users can read own + public mover profiles; update own
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can read mover profiles" ON profiles FOR SELECT USING (role IN ('mover', 'both'));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ─────────────────────────────────────────────────
-- mover_profiles
-- ─────────────────────────────────────────────────
CREATE TABLE mover_profiles (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending',
  vehicle_type text,
  license_doc_url text,
  insurance_doc_url text,
  background_check_status text DEFAULT 'pending',
  background_check_id text,
  stripe_account_id text,
  stripe_onboarding_complete boolean DEFAULT false,
  service_area_zip text[],
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mover_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movers can read own mover_profile" ON mover_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Movers can update own mover_profile" ON mover_profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Cannot change their own status (admin only)
    status = (SELECT status FROM mover_profiles WHERE id = auth.uid())
  );
CREATE POLICY "Movers can insert own mover_profile" ON mover_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────
-- gigs
-- ─────────────────────────────────────────────────
CREATE TABLE gigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status text CHECK (status IN ('draft', 'posted', 'matched', 'in_progress', 'completed', 'cancelled')) DEFAULT 'draft',

  -- Locations
  from_address text NOT NULL,
  from_lat numeric,
  from_lng numeric,
  from_zip text,
  to_address text NOT NULL,
  to_lat numeric,
  to_lng numeric,
  to_zip text,
  distance_miles numeric,

  -- Move size
  home_size text,
  rooms jsonb,
  heavy_items text[],

  -- Crew + truck
  crew_size int CHECK (crew_size BETWEEN 1 AND 6),
  truck_size text,

  -- Access
  stairs_from int DEFAULT 0,
  stairs_to int DEFAULT 0,
  elevator_from boolean DEFAULT false,
  elevator_to boolean DEFAULT false,
  long_carry boolean DEFAULT false,
  has_fragile_items boolean DEFAULT false,

  -- When
  scheduled_for timestamptz,
  estimated_duration_hours numeric,

  -- Pricing
  pricing_model text CHECK (pricing_model IN ('flat', 'hourly')) DEFAULT 'flat',
  quoted_price_cents int,
  final_price_cents int,
  hourly_rate_cents int,

  -- Notes
  customer_notes text,

  -- Matched mover
  mover_id uuid REFERENCES profiles(id),
  matched_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can CRUD own gigs" ON gigs FOR ALL USING (auth.uid() = customer_id);
CREATE POLICY "Movers can read posted gigs" ON gigs FOR SELECT USING (status = 'posted');
CREATE POLICY "Matched mover can read their gig" ON gigs FOR SELECT USING (auth.uid() = mover_id);
CREATE POLICY "Matched mover can update status" ON gigs FOR UPDATE USING (auth.uid() = mover_id);

-- ─────────────────────────────────────────────────
-- gig_photos
-- ─────────────────────────────────────────────────
CREATE TABLE gig_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  label text,
  position int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gig_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photos follow gig access" ON gig_photos FOR SELECT
  USING (EXISTS (SELECT 1 FROM gigs WHERE gigs.id = gig_photos.gig_id AND (gigs.customer_id = auth.uid() OR gigs.status = 'posted' OR gigs.mover_id = auth.uid())));
CREATE POLICY "Customer can insert photos on own gig" ON gig_photos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gigs WHERE gigs.id = gig_photos.gig_id AND gigs.customer_id = auth.uid()));
CREATE POLICY "Customer can delete photos on own gig" ON gig_photos FOR DELETE
  USING (EXISTS (SELECT 1 FROM gigs WHERE gigs.id = gig_photos.gig_id AND gigs.customer_id = auth.uid()));

-- ─────────────────────────────────────────────────
-- gig_applications
-- ─────────────────────────────────────────────────
CREATE TABLE gig_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES gigs(id) ON DELETE CASCADE NOT NULL,
  mover_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status text CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')) DEFAULT 'pending',
  quoted_price_cents int,
  message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (gig_id, mover_id)
);

ALTER TABLE gig_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movers can CRUD own applications" ON gig_applications FOR ALL USING (auth.uid() = mover_id);
CREATE POLICY "Customers can read applications on their gigs" ON gig_applications FOR SELECT
  USING (EXISTS (SELECT 1 FROM gigs WHERE gigs.id = gig_applications.gig_id AND gigs.customer_id = auth.uid()));
CREATE POLICY "Customers can update application status on their gigs" ON gig_applications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gigs WHERE gigs.id = gig_applications.gig_id AND gigs.customer_id = auth.uid()));

-- ─────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES gigs(id),
  customer_id uuid REFERENCES profiles(id),
  mover_id uuid REFERENCES profiles(id),
  amount_cents int NOT NULL,
  platform_fee_cents int NOT NULL,
  tip_cents int DEFAULT 0,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  status text CHECK (status IN ('pending', 'authorized', 'captured', 'refunded', 'failed')) DEFAULT 'pending',
  captured_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Read-only for both parties; writes only via service role (edge functions)
CREATE POLICY "Parties can read their payments" ON payments FOR SELECT
  USING (auth.uid() = customer_id OR auth.uid() = mover_id);

-- ─────────────────────────────────────────────────
-- reviews
-- ─────────────────────────────────────────────────
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES gigs(id) NOT NULL,
  reviewer_id uuid REFERENCES profiles(id) NOT NULL,
  reviewee_id uuid REFERENCES profiles(id) NOT NULL,
  rating int CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (gig_id, reviewer_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Parties of completed gig can write review" ON reviews FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM gigs
    WHERE gigs.id = reviews.gig_id
    AND gigs.status = 'completed'
    AND (gigs.customer_id = auth.uid() OR gigs.mover_id = auth.uid())
  ));

-- ─────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  kind text NOT NULL,
  payload jsonb DEFAULT '{}',
  read_at timestamptz,
  sent_via text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────
-- Storage bucket for gig photos
-- ─────────────────────────────────────────────────
-- Run in Supabase dashboard or via CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('gig-photos', 'gig-photos', true);

-- ─────────────────────────────────────────────────
-- Updated_at trigger
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER mover_profiles_updated_at BEFORE UPDATE ON mover_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER gigs_updated_at BEFORE UPDATE ON gigs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

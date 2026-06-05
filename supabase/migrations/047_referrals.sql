-- Migration 047 — individual referral program
--
-- Model: a referrer (existing/happy customer) gets a code + QR. A new customer who
-- books through that code gets a ONE-TIME $25 credit toward their move; once their
-- move COMPLETES, the referrer is owed $20 cash (paid out manually, tracked here).
--
--   * referral_codes  — one row per referrer (admin-created in the dashboard).
--   * referrals       — the ledger: one redemption per referred lead/gig.
--   * quote_requests / gigs get referral_code + referral_credit_cents columns.
--   * referral_credit_for() — eligibility RPC (anon-callable from the intake form)
--     that returns the credit (2500) or 0, enforcing: valid+active code, no
--     self-referral, and ONCE per person (dedupe by email OR phone OR name).
--   * a gig completing flips the matching referrals row to reward_status='owed'.
--
-- The $25 credit is absorbed by the platform: the mover payout is grossed back up
-- in stripe-webhook so referrals never short the mover.
--
-- Use named $func$ quoting (the Supabase SQL editor mangles $$).

-- ── referral_codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL,
  referrer_name  text,
  referrer_email text,
  referrer_phone text,
  reward_cents   int  NOT NULL DEFAULT 2000,   -- $20 cash to the referrer
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_by     uuid,
  created_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_upper_idx ON referral_codes (upper(code));

-- ── referrals (ledger) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code    text NOT NULL,
  referrer_name    text,
  referrer_email   text,
  referrer_phone   text,
  referred_name    text,
  referred_email   text,
  referred_phone   text,
  quote_request_id uuid UNIQUE,
  gig_id           uuid,
  credit_cents     int  NOT NULL DEFAULT 0,     -- $25 the referred customer saved
  reward_cents     int  NOT NULL DEFAULT 0,     -- $20 owed to the referrer
  reward_status    text NOT NULL DEFAULT 'pending', -- pending | owed | paid | void
  created_at       timestamptz DEFAULT now(),
  completed_at     timestamptz,
  reward_paid_at   timestamptz
);
CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals (referral_code);
CREATE INDEX IF NOT EXISTS referrals_gig_idx ON referrals (gig_id);
CREATE INDEX IF NOT EXISTS referrals_referred_email_idx ON referrals (lower(referred_email));

-- ── columns on the lead + gig ────────────────────────────────────────────────
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS referral_credit_cents int DEFAULT 0;
ALTER TABLE gigs           ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE gigs           ADD COLUMN IF NOT EXISTS referral_credit_cents int DEFAULT 0;

-- ── lookup: returns { valid, referrer_name, code, eligible, credit_cents } ────
-- SECURITY DEFINER so the public intake form (anon) can resolve a ?ref= code
-- without reading the referral tables directly. Returns the referrer's name (to
-- show "Referral from <name>") and the credit (2500 if eligible, else 0).
-- credit_cents = 0 when the code is invalid/inactive, a self-referral, or the
-- person has already redeemed once (dedupe by email OR phone OR name).
CREATE OR REPLACE FUNCTION public.referral_lookup(p_code text, p_email text, p_phone text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_code  text := upper(trim(coalesce(p_code, '')));
  rc      referral_codes%ROWTYPE;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name  text := lower(trim(coalesce(p_name, '')));
  v_credit constant int := 2500;
  v_eligible boolean := true;
BEGIN
  IF v_code = '' THEN RETURN jsonb_build_object('valid', false, 'credit_cents', 0); END IF;

  SELECT * INTO rc FROM referral_codes WHERE upper(code) = v_code AND active LIMIT 1;
  IF rc.id IS NULL THEN RETURN jsonb_build_object('valid', false, 'credit_cents', 0); END IF;

  -- No self-referral.
  IF (v_email <> '' AND lower(trim(coalesce(rc.referrer_email, ''))) = v_email)
     OR (v_phone <> '' AND regexp_replace(coalesce(rc.referrer_phone, ''), '\D', '', 'g') = v_phone) THEN
    v_eligible := false;
  END IF;

  -- Once per person: any prior BOOKED redemption (gig_id set) by the same
  -- email OR phone OR name disqualifies the credit.
  IF v_eligible AND EXISTS (
    SELECT 1 FROM referrals r
    WHERE r.credit_cents > 0 AND r.reward_status <> 'void' AND r.gig_id IS NOT NULL
      AND (
        (v_email <> '' AND lower(trim(coalesce(r.referred_email, ''))) = v_email)
        OR (v_phone <> '' AND regexp_replace(coalesce(r.referred_phone, ''), '\D', '', 'g') = v_phone)
        OR (v_name  <> '' AND lower(trim(coalesce(r.referred_name, ''))) = v_name)
      )
  ) THEN
    v_eligible := false;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'referrer_name', rc.referrer_name,
    'code', rc.code,
    'eligible', v_eligible,
    'credit_cents', CASE WHEN v_eligible THEN v_credit ELSE 0 END
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.referral_lookup(text, text, text, text) FROM PUBLIC;
-- anon: intake form. authenticated: admin. service_role: create-quote-payment edge fn.
GRANT EXECUTE ON FUNCTION public.referral_lookup(text, text, text, text) TO anon, authenticated, service_role;

-- ── completion → referrer owed ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_referral_owed_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed'
     AND NEW.referral_code IS NOT NULL THEN
    UPDATE referrals
      SET reward_status = 'owed', completed_at = now()
      WHERE gig_id = NEW.id AND reward_status = 'pending';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_referral_owed ON gigs;
CREATE TRIGGER trg_referral_owed AFTER UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION mark_referral_owed_on_complete();

-- ── RLS: admin-only (edge fns + RPCs use service role / SECURITY DEFINER) ─────
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage referral codes" ON referral_codes;
CREATE POLICY "Admins manage referral codes" ON referral_codes
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage referrals" ON referrals;
CREATE POLICY "Admins manage referrals" ON referrals
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── save_quote_lead(): re-declare to also persist referral_code ──────────────
-- (mirrors migration 036; only addition is referral_code in the column allow-list.
-- referral_credit_cents is NOT settable here — it is decided server-side.)
CREATE OR REPLACE FUNCTION public.save_quote_lead(p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id uuid := (p_data->>'id')::uuid;
  r quote_requests%ROWTYPE;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  IF EXISTS (SELECT 1 FROM quote_requests WHERE id = v_id AND payment_status = 'paid') THEN
    RAISE EXCEPTION 'Lead already paid';
  END IF;

  r := jsonb_populate_record(NULL::quote_requests, p_data);

  INSERT INTO quote_requests (
    id, name, phone, email, service_type, preferred_date, preferred_time,
    pickup_address, pickup_place_type, dropoff_address, dropoff_place_type,
    items_size, items_list, stairs_pickup, stairs_dropoff, flights_pickup, flights_dropoff,
    parking, special_items, common_items, common_item_details, items_boxed, box_count,
    packing_service, prep_needed, staging, other_notes, photo_urls,
    estimated_price_cents, answers, notes, status, progress_step, referral_code
  ) VALUES (
    v_id, r.name, r.phone, r.email, r.service_type, r.preferred_date, r.preferred_time,
    r.pickup_address, r.pickup_place_type, r.dropoff_address, r.dropoff_place_type,
    r.items_size, r.items_list, r.stairs_pickup, r.stairs_dropoff, r.flights_pickup, r.flights_dropoff,
    r.parking, r.special_items, r.common_items, r.common_item_details, r.items_boxed, r.box_count,
    COALESCE(r.packing_service, false), r.prep_needed, COALESCE(r.staging, false), r.other_notes, r.photo_urls,
    r.estimated_price_cents, r.answers, r.notes, COALESCE(r.status, 'active'), r.progress_step, r.referral_code
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
    service_type = EXCLUDED.service_type, preferred_date = EXCLUDED.preferred_date,
    preferred_time = EXCLUDED.preferred_time, pickup_address = EXCLUDED.pickup_address,
    pickup_place_type = EXCLUDED.pickup_place_type, dropoff_address = EXCLUDED.dropoff_address,
    dropoff_place_type = EXCLUDED.dropoff_place_type, items_size = EXCLUDED.items_size,
    items_list = EXCLUDED.items_list, stairs_pickup = EXCLUDED.stairs_pickup,
    stairs_dropoff = EXCLUDED.stairs_dropoff, flights_pickup = EXCLUDED.flights_pickup,
    flights_dropoff = EXCLUDED.flights_dropoff, parking = EXCLUDED.parking,
    special_items = EXCLUDED.special_items, common_items = EXCLUDED.common_items,
    common_item_details = EXCLUDED.common_item_details, items_boxed = EXCLUDED.items_boxed,
    box_count = EXCLUDED.box_count, packing_service = EXCLUDED.packing_service,
    prep_needed = EXCLUDED.prep_needed, staging = EXCLUDED.staging,
    other_notes = EXCLUDED.other_notes, photo_urls = EXCLUDED.photo_urls,
    estimated_price_cents = EXCLUDED.estimated_price_cents, answers = EXCLUDED.answers,
    notes = EXCLUDED.notes, status = EXCLUDED.status, progress_step = EXCLUDED.progress_step,
    referral_code = EXCLUDED.referral_code;
END;
$func$;

REVOKE ALL ON FUNCTION public.save_quote_lead(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO authenticated;

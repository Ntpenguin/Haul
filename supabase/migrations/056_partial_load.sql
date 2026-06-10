-- 056: Partial-load tier for Studio / 1 BR leads.
--
-- When a customer's load is about half (or less) of a full Studio / 1 BR, the
-- intake form lets them flag it as a partial load and the base price is charged
-- at 75% (a 25% discount). Stored on the lead so create-quote-payment can
-- recompute the server-authoritative charge. Defaults false (no behavior change
-- for existing leads). Only applied for items_size IN ('Studio','1 BR').
--
-- Mirrors the staging/packing precedent (migrations 025/030). The app gig wizard
-- does not expose this yet, so gigs gets no column for now.

alter table quote_requests
  add column if not exists partial_load boolean not null default false;

-- save_quote_lead() writes a FIXED column allow-list (migration 036, last
-- re-declared in 047). Re-declare it to also persist partial_load — otherwise the
-- intake form's value is silently dropped and the server would charge full price.
-- Use named dollar-quoting ($func$) — the Supabase SQL editor mangles $$.
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
    estimated_price_cents, answers, notes, status, progress_step, referral_code, partial_load
  ) VALUES (
    v_id, r.name, r.phone, r.email, r.service_type, r.preferred_date, r.preferred_time,
    r.pickup_address, r.pickup_place_type, r.dropoff_address, r.dropoff_place_type,
    r.items_size, r.items_list, r.stairs_pickup, r.stairs_dropoff, r.flights_pickup, r.flights_dropoff,
    r.parking, r.special_items, r.common_items, r.common_item_details, r.items_boxed, r.box_count,
    COALESCE(r.packing_service, false), r.prep_needed, COALESCE(r.staging, false), r.other_notes, r.photo_urls,
    r.estimated_price_cents, r.answers, r.notes, COALESCE(r.status, 'active'), r.progress_step, r.referral_code,
    COALESCE(r.partial_load, false)
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
    referral_code = EXCLUDED.referral_code, partial_load = EXCLUDED.partial_load;
END;
$func$;

REVOKE ALL ON FUNCTION public.save_quote_lead(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO authenticated;

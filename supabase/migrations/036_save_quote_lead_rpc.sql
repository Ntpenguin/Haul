-- Migration 036 — save_quote_lead(): SECURITY DEFINER upsert for the public intake form
--
-- Why this exists
--   The intake form (landing/intake.html) creates a lead on step 1 (contact) and
--   then progressively fills it in (size, price, photos, final submit). Those
--   follow-up writes were direct anon PATCHes, but they silently updated 0 rows:
--   in PostgreSQL an UPDATE must also be able to SEE the row, and quote_requests
--   only grants SELECT to authenticated — never anon. So every post-insert write
--   was lost and the lead was stuck at step 1 with a NULL price (and NULL move
--   details), which made create-quote-payment reject the charge
--   ("Quote has no valid price").
--
--   We deliberately do NOT add an anon SELECT policy: the anon key is public
--   (embedded in the landing page), so SELECT USING(true) would let anyone dump
--   every lead's name/phone/email/address. Instead all writes go through this
--   SECURITY DEFINER upsert, so anon keeps zero direct read/write on the table.
--
-- Security properties
--   * Runs as the table owner, so it bypasses RLS for the write only.
--   * Writes a fixed allow-list of columns. It NEVER touches payment_status,
--     deposit_cents, stripe_payment_intent_id, paid_at-equivalents, created_at,
--     or deleted_at — so the public form cannot mark itself paid or tamper with
--     payment state.
--   * Refuses to modify a lead that is already paid.
--   * Returns nothing (no row data leaks back to the caller).
--   * Row ids are unguessable v4 UUIDs minted client-side, so one anon caller
--     cannot target another caller's lead without already knowing its UUID.
--
-- NOTE (separate, pre-launch hardening): create-quote-payment still charges the
-- estimated_price_cents stored here, which originates from client-side math.
-- Recompute the price server-side from the saved move details before launch so
-- the charged amount is fully server-authoritative.

-- The old direct-PATCH policy is now unused (and never worked for anon). Drop it
-- so anon has no direct UPDATE path at all; all writes go through the RPC.
DROP POLICY IF EXISTS "Anyone can update their own quote payment" ON quote_requests;

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

  -- Never modify a lead that has already been paid.
  IF EXISTS (SELECT 1 FROM quote_requests WHERE id = v_id AND payment_status = 'paid') THEN
    RAISE EXCEPTION 'Lead already paid';
  END IF;

  -- Type-coerce the incoming JSON into a typed row (extra keys are ignored).
  r := jsonb_populate_record(NULL::quote_requests, p_data);

  INSERT INTO quote_requests (
    id, name, phone, email, service_type, preferred_date, preferred_time,
    pickup_address, pickup_place_type, dropoff_address, dropoff_place_type,
    items_size, items_list, stairs_pickup, stairs_dropoff, flights_pickup, flights_dropoff,
    parking, special_items, common_items, common_item_details, items_boxed, box_count,
    packing_service, prep_needed, staging, other_notes, photo_urls,
    estimated_price_cents, answers, notes, status, progress_step
  ) VALUES (
    v_id, r.name, r.phone, r.email, r.service_type, r.preferred_date, r.preferred_time,
    r.pickup_address, r.pickup_place_type, r.dropoff_address, r.dropoff_place_type,
    r.items_size, r.items_list, r.stairs_pickup, r.stairs_dropoff, r.flights_pickup, r.flights_dropoff,
    r.parking, r.special_items, r.common_items, r.common_item_details, r.items_boxed, r.box_count,
    COALESCE(r.packing_service, false), r.prep_needed, COALESCE(r.staging, false), r.other_notes, r.photo_urls,
    r.estimated_price_cents, r.answers, r.notes, COALESCE(r.status, 'active'), r.progress_step
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
    notes = EXCLUDED.notes, status = EXCLUDED.status, progress_step = EXCLUDED.progress_step;
END;
$func$;

REVOKE ALL ON FUNCTION public.save_quote_lead(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.save_quote_lead(jsonb) TO authenticated;

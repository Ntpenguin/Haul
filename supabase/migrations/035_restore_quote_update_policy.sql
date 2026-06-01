-- Migration 035 — restore the anon UPDATE policy on quote_requests
--
-- Problem this fixes:
--   The intake form (landing/intake.html) creates the lead row on the FIRST
--   step (contact is Q1) via an anon INSERT, when the move size (Q5) is not yet
--   known — so estimated_price_cents is NULL at insert time. It then PATCHes the
--   row on every step advance and on final submit to fill in the size, the real
--   estimated_price_cents, photo_urls, status, and progress_step.
--
--   Migration 020 was supposed to grant anon UPDATE for exactly this, but the
--   policy is not present on the live DB (the columns from 020 exist, but the
--   CREATE POLICY did not take). With no UPDATE policy, RLS denies by default:
--   every PATCH silently affects 0 rows (PostgREST returns 204), so the lead
--   stays stuck at the first step with a NULL price. create-quote-payment then
--   reads estimated_price_cents = NULL and returns "Quote has no valid price".
--
-- Scope note: anon has no identity, so we cannot scope this to "own row". We at
-- least block edits to rows that are already paid, so a completed payment's
-- amount/status can't be tampered with after the fact.
--
-- SECURITY follow-up (do before launch): create-quote-payment trusts the stored
-- estimated_price_cents, which anon can set. Recompute the price server-side in
-- the edge function (port lib/pricing logic) so the charged amount is truly
-- server-authoritative and not client-controlled.

DROP POLICY IF EXISTS "Anyone can update their own quote payment" ON quote_requests;

CREATE POLICY "Anyone can update their own quote payment"
  ON quote_requests FOR UPDATE
  TO anon
  USING (payment_status IS DISTINCT FROM 'paid')
  WITH CHECK (true);

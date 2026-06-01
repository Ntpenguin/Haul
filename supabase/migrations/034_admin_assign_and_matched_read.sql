-- Migration 034 — admin mover-assignment for lead-sourced gigs + matched-gig read
--
-- Problem this fixes:
--  1. Paid website leads convert into marketplace gigs with customer_id = NULL
--     (no in-app customer). Movers can apply, but the customer-accept RLS keys
--     off gigs.customer_id = auth.uid(), so NULL-customer gigs can never have an
--     application accepted. Admin had no assign action either. This RPC lets an
--     allow-listed admin accept/assign a mover on ANY gig, bypassing RLS safely
--     via SECURITY DEFINER + an explicit admin check.
--  2. Movers could only read 'posted' gigs, so a 'matched' gig that still has
--     open crew slots was invisible to additional movers (multi-crew discovery).
--     Add a read policy for matched gigs.

-- ─────────────────────────────────────────────────
-- admins allow-list (authorization for privileged ops)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: clients can never read/enumerate the admin list.
-- Only the service role and SECURITY DEFINER functions can see it.

-- Seed your admin account ONCE (find the uid in Supabase Auth → Users):
--   INSERT INTO admins (user_id) VALUES ('<your-auth-user-uuid>');

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────
-- assign_mover_to_gig — admin accepts a mover application
-- Mirrors hooks/useGigs.ts acceptApplication (crew cap + lead logic) but is
-- callable for NULL-customer (lead-sourced) gigs. Admin-only.
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assign_mover_to_gig(p_gig_id uuid, p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mover uuid;
  v_slots int;
  v_crew int;
  v_status text;
  v_accepted_slots int;
  v_has_lead boolean;
  v_is_lead boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT mover_id, COALESCE(slots_claimed, 1)
    INTO v_mover, v_slots
    FROM gig_applications
    WHERE id = p_application_id AND gig_id = p_gig_id;
  IF v_mover IS NULL THEN
    RAISE EXCEPTION 'Application not found for this gig';
  END IF;

  SELECT COALESCE(crew_size, 1), status
    INTO v_crew, v_status
    FROM gigs WHERE id = p_gig_id;

  SELECT COALESCE(SUM(COALESCE(slots_claimed, 1)), 0), COALESCE(BOOL_OR(is_lead), false)
    INTO v_accepted_slots, v_has_lead
    FROM gig_applications
    WHERE gig_id = p_gig_id AND status = 'accepted';

  IF v_accepted_slots + v_slots > v_crew THEN
    RAISE EXCEPTION 'Crew is already full';
  END IF;

  v_is_lead := NOT v_has_lead;

  UPDATE gig_applications
    SET status = 'accepted', is_lead = v_is_lead
    WHERE id = p_application_id;

  -- Lead-sourced gigs are paid upfront on the website (paid_at stamped at
  -- conversion). Once a mover is assigned they're effectively in progress, so
  -- promote them straight to 'in_progress' to unlock the mover's "I'm on my way",
  -- mark-complete, and payout flow (which all gate on status='in_progress').
  -- Unpaid app gigs (paid_at IS NULL) still go to 'matched' awaiting customer payment.
  UPDATE gigs
    SET status = CASE
                   WHEN paid_at IS NOT NULL AND status IN ('posted', 'matched') THEN 'in_progress'
                   WHEN status = 'posted' THEN 'matched'
                   ELSE status
                 END,
        matched_at = COALESCE(matched_at, now()),
        mover_id = CASE WHEN v_is_lead THEN v_mover ELSE mover_id END
    WHERE id = p_gig_id;
END;
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION assign_mover_to_gig(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────
-- Movers can read matched gigs (multi-crew open-slot discovery)
-- ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Movers can read matched gigs" ON gigs;
CREATE POLICY "Movers can read matched gigs" ON gigs FOR SELECT USING (status = 'matched');

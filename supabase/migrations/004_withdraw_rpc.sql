-- RPC for mover withdrawal — bypasses RLS so mover_id can be set to null
CREATE OR REPLACE FUNCTION withdraw_from_gig(p_gig_id uuid)
RETURNS void AS $$
BEGIN
  -- Only allow if the caller is the current mover on this gig
  UPDATE gigs
  SET status = 'posted', mover_id = null, matched_at = null
  WHERE id = p_gig_id
    AND mover_id = auth.uid()
    AND status IN ('matched', 'in_progress');

  UPDATE gig_applications
  SET status = 'withdrawn'
  WHERE gig_id = p_gig_id
    AND mover_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

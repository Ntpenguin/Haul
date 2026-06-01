-- Migration 041 — server-side rate limiter for edge functions (PaymentIntent creation)
--
-- Backs up client-side throttling: limits how often a caller can create a Stripe
-- PaymentIntent, to curb abuse and runaway Stripe API cost. Called by the
-- create-quote-payment (public, keyed by IP) and create-payment-intent (authed,
-- keyed by user id) edge functions via the service-role client.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     text NOT NULL,   -- which endpoint, e.g. 'create-quote-payment'
  key        text NOT NULL,   -- caller identity: IP, user id, or resource id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup
  ON rate_limit_hits (bucket, key, created_at);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (edge functions) and SECURITY
-- DEFINER functions touch this table. anon / authenticated get nothing.

-- Records a hit and returns TRUE if the caller is still within the limit, or
-- FALSE if they have already made p_max hits within the last p_window_seconds.
-- (Named dollar-quote $func$ — the Supabase SQL editor mangles bare $$.)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_bucket         text,
  p_key            text,
  p_max            int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_count int;
BEGIN
  -- Opportunistic cleanup of rows well past the window (keeps the table small).
  DELETE FROM rate_limit_hits
    WHERE bucket = p_bucket
      AND created_at < now() - make_interval(secs => p_window_seconds * 5);

  SELECT count(*) INTO v_count
    FROM rate_limit_hits
    WHERE bucket = p_bucket
      AND key = p_key
      AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_hits (bucket, key) VALUES (p_bucket, p_key);
  RETURN true;
END;
$func$;

-- Only the edge functions (service role) should call this; not the public roles.
REVOKE ALL ON FUNCTION check_rate_limit(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, int, int) TO service_role;

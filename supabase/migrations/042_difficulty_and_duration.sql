-- Migration 042 — move difficulty rating + distance-aware duration + mover skill gate
--
-- 1. gigs.difficulty (1 Easy .. 5 Expert), computed from move attributes by a
--    BEFORE INSERT/UPDATE trigger so it's correct for BOTH app gigs and
--    lead-sourced gigs (and any later edit) without app/webhook code knowing.
-- 2. gigs.estimated_duration_hours now factors in drive distance.
-- 3. mover_profiles.max_difficulty (1..5): the hardest job a mover may be
--    assigned. Auto-seeded from years_experience on insert; admin can override.
-- 4. assign_mover_to_gig refuses to assign a mover whose level is below the
--    gig's difficulty (admin-assign gate).
--
-- Keep the scoring in sync with lib/difficulty.ts (app display) + intake form.
-- Named dollar-quote $func$ (the Supabase SQL editor mangles bare $$).

ALTER TABLE gigs ADD COLUMN IF NOT EXISTS difficulty int;
ALTER TABLE mover_profiles ADD COLUMN IF NOT EXISTS max_difficulty int NOT NULL DEFAULT 1;

-- ── helpers (handle BOTH the app vocab ('2br') and the intake vocab ('2 BR')) ──
CREATE OR REPLACE FUNCTION gig_size_points(p_size text)
RETURNS int LANGUAGE sql IMMUTABLE AS $func$
  SELECT CASE lower(coalesce(p_size, ''))
    WHEN 'few-items' THEN 0 WHEN 'just a few items' THEN 0
    WHEN 'studio' THEN 1
    WHEN '1br' THEN 1 WHEN '1 br' THEN 1
    WHEN '2br' THEN 2 WHEN '2 br' THEN 2
    WHEN '3br+' THEN 3 WHEN '3br' THEN 3 WHEN '3 br' THEN 3
    WHEN '4br' THEN 4 WHEN '4+ br / full house' THEN 4
    ELSE 1
  END;
$func$;

CREATE OR REPLACE FUNCTION gig_size_hours(p_size text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $func$
  SELECT CASE lower(coalesce(p_size, ''))
    WHEN 'few-items' THEN 1.5 WHEN 'just a few items' THEN 1.5
    WHEN 'studio' THEN 2.5
    WHEN '1br' THEN 3.5 WHEN '1 br' THEN 3.5
    WHEN '2br' THEN 5 WHEN '2 br' THEN 5
    WHEN '3br+' THEN 7 WHEN '3br' THEN 7 WHEN '3 br' THEN 7
    WHEN '4br' THEN 8.5 WHEN '4+ br / full house' THEN 8.5
    ELSE 3
  END;
$func$;

CREATE OR REPLACE FUNCTION mover_level_from_experience(p_years int)
RETURNS int LANGUAGE sql IMMUTABLE AS $func$
  SELECT CASE
    WHEN p_years IS NULL OR p_years < 1 THEN 1
    WHEN p_years <= 2 THEN 2
    WHEN p_years <= 4 THEN 3
    WHEN p_years <= 7 THEN 4
    ELSE 5
  END;
$func$;

-- ── difficulty score -> tier 1..5 ──
CREATE OR REPLACE FUNCTION compute_gig_difficulty(
  p_home_size text, p_stairs_from int, p_stairs_to int, p_heavy_items text[],
  p_distance_miles numeric, p_staging boolean, p_packing boolean
) RETURNS int LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE
  v_score   int := gig_size_points(p_home_size);
  v_flights int := coalesce(p_stairs_from, 0) + coalesce(p_stairs_to, 0);
  v_item    text;
  v_hard    boolean := false;
BEGIN
  IF v_flights > 0  THEN v_score := v_score + 1; END IF;   -- any stairs
  IF v_flights >= 4 THEN v_score := v_score + 1; END IF;   -- lots of stairs
  IF coalesce(array_length(p_heavy_items, 1), 0) > 0 THEN
    v_score := v_score + 1;                                 -- has specialty items
    FOREACH v_item IN ARRAY p_heavy_items LOOP
      IF lower(v_item) ~ '(piano|pool|hot ?tub|hot-tub|safe)' THEN v_hard := true; END IF;
    END LOOP;
    IF v_hard THEN v_score := v_score + 1; END IF;          -- a hard specialty item
  END IF;
  IF coalesce(p_distance_miles, 0) >= 50 THEN v_score := v_score + 1; END IF; -- long distance
  IF coalesce(p_staging, false) THEN v_score := v_score + 1; END IF;
  IF coalesce(p_packing, false) THEN v_score := v_score + 1; END IF;

  RETURN CASE
    WHEN v_score <= 1 THEN 1
    WHEN v_score =  2 THEN 2
    WHEN v_score <= 4 THEN 3
    WHEN v_score <= 6 THEN 4
    ELSE 5
  END;
END;
$func$;

CREATE OR REPLACE FUNCTION compute_gig_duration_hours(p_home_size text, p_distance_miles numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $func$
  -- size-based labor hours + one-way loaded drive time at ~45 mph
  SELECT round((gig_size_hours(p_home_size) + coalesce(p_distance_miles, 0) / 45.0)::numeric, 1);
$func$;

-- ── trigger: stamp difficulty + duration on gigs ──
CREATE OR REPLACE FUNCTION set_gig_difficulty_and_duration()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  NEW.difficulty := compute_gig_difficulty(
    NEW.home_size, NEW.stairs_from, NEW.stairs_to, NEW.heavy_items,
    NEW.distance_miles, NEW.staging, NEW.packing_service);
  NEW.estimated_duration_hours := compute_gig_duration_hours(NEW.home_size, NEW.distance_miles);
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_gig_difficulty ON gigs;
CREATE TRIGGER trg_gig_difficulty
  BEFORE INSERT OR UPDATE OF home_size, stairs_from, stairs_to, heavy_items, distance_miles, staging, packing_service
  ON gigs FOR EACH ROW EXECUTE FUNCTION set_gig_difficulty_and_duration();

-- ── trigger: auto-seed a new mover's level from experience (admin can override later) ──
CREATE OR REPLACE FUNCTION set_mover_default_level()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  -- Only derive when left at the default (1); a later admin UPDATE sticks.
  IF NEW.max_difficulty IS NULL OR NEW.max_difficulty = 1 THEN
    NEW.max_difficulty := mover_level_from_experience(NEW.years_experience);
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_mover_default_level ON mover_profiles;
CREATE TRIGGER trg_mover_default_level
  BEFORE INSERT ON mover_profiles
  FOR EACH ROW EXECUTE FUNCTION set_mover_default_level();

-- ── backfill existing rows ──
UPDATE mover_profiles SET max_difficulty = mover_level_from_experience(years_experience);
UPDATE gigs SET
  difficulty = compute_gig_difficulty(home_size, stairs_from, stairs_to, heavy_items, distance_miles, staging, packing_service),
  estimated_duration_hours = compute_gig_duration_hours(home_size, distance_miles);

-- ── assign_mover_to_gig: add the difficulty gate (admin-assign only) ──
CREATE OR REPLACE FUNCTION assign_mover_to_gig(p_gig_id uuid, p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_mover uuid;
  v_slots int;
  v_crew int;
  v_status text;
  v_accepted_slots int;
  v_has_lead boolean;
  v_is_lead boolean;
  v_difficulty int;
  v_mover_level int;
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

  -- Difficulty gate: the mover's skill level must meet or exceed the job's difficulty.
  SELECT COALESCE(difficulty, 1) INTO v_difficulty FROM gigs WHERE id = p_gig_id;
  SELECT COALESCE(max_difficulty, 1) INTO v_mover_level FROM mover_profiles WHERE id = v_mover;
  IF COALESCE(v_mover_level, 1) < COALESCE(v_difficulty, 1) THEN
    RAISE EXCEPTION 'Mover skill level % is below this job''s difficulty %', COALESCE(v_mover_level, 1), v_difficulty;
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
$func$;

GRANT EXECUTE ON FUNCTION assign_mover_to_gig(uuid, uuid) TO authenticated;

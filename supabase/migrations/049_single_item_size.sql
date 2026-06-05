-- Migration 049 — add the "Single item" size tier to difficulty/duration mapping.
--
-- "Single item" (move one piece) is a new smallest tier ($85) added to the intake
-- form + business form. The difficulty/duration helpers (042) need to recognize it
-- so single-item lead-gigs get the lowest difficulty (0 size points) and ~1h labor;
-- otherwise they'd fall to the ELSE default (1 pt / 3h) and over-estimate.

CREATE OR REPLACE FUNCTION gig_size_points(p_size text)
RETURNS int LANGUAGE sql IMMUTABLE AS $func$
  SELECT CASE lower(coalesce(p_size, ''))
    WHEN 'single item' THEN 0
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
    WHEN 'single item' THEN 1
    WHEN 'few-items' THEN 1.5 WHEN 'just a few items' THEN 1.5
    WHEN 'studio' THEN 2.5
    WHEN '1br' THEN 3.5 WHEN '1 br' THEN 3.5
    WHEN '2br' THEN 5 WHEN '2 br' THEN 5
    WHEN '3br+' THEN 7 WHEN '3br' THEN 7 WHEN '3 br' THEN 7
    WHEN '4br' THEN 8.5 WHEN '4+ br / full house' THEN 8.5
    ELSE 3
  END;
$func$;

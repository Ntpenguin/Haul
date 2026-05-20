-- Trigger: recalculate profile rating after each review insert
CREATE OR REPLACE FUNCTION update_profile_rating()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles
  SET rating = (
    SELECT ROUND(AVG(rating)::numeric, 1)
    FROM reviews
    WHERE reviewee_id = NEW.reviewee_id
  )
  WHERE id = NEW.reviewee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_inserted
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_profile_rating();

-- Trigger: increment total_gigs for both mover and customer when gig completes
CREATE OR REPLACE FUNCTION update_total_gigs()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF NEW.mover_id IS NOT NULL THEN
      UPDATE profiles SET total_gigs = total_gigs + 1 WHERE id = NEW.mover_id;
    END IF;
    UPDATE profiles SET total_gigs = total_gigs + 1 WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_gig_completed
  AFTER UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION update_total_gigs();

-- Enable realtime on gigs and gig_applications so home screens update live
ALTER PUBLICATION supabase_realtime ADD TABLE gigs;
ALTER PUBLICATION supabase_realtime ADD TABLE gig_applications;

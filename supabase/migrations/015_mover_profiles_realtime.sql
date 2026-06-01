-- Enable Supabase Realtime on mover_profiles so the app can auto-refresh when a mover is approved
ALTER PUBLICATION supabase_realtime ADD TABLE mover_profiles;

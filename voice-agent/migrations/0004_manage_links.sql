-- Self-serve appointment management (cancel/reschedule links) + digest support.
ALTER TABLE appointments ADD COLUMN manage_token UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'booked';  -- booked | cancelled
CREATE UNIQUE INDEX idx_appt_token ON appointments(manage_token);

-- 057: Unify the Crew & pay roster with the Workers tab (app movers) + soft-delete movers.
--
-- Context: the loginless `workers` table (migration 054) is retired as a separate
-- roster. The admin now manages ONE set of workers — the app movers in
-- mover_profiles (Workers tab; created via the web signup or admin "+ Add worker").
-- The manual payout ledger (worker_payouts) and gig crew assignment (job_crew) now
-- reference a mover's profiles(id) instead of workers(id).
--
-- Safe to repoint with no data migration: workers, worker_payouts, and job_crew are
-- all empty in prod (verified 2026-06-09). The `workers` table is left in place but
-- unused.

-- ── Soft-delete for movers (Workers tab) ────────────────────────────────────
-- "Delete worker" hides them from the Workers/Crew lists but preserves all gig &
-- review history (gigs.mover_id / reviews.mover_id are RESTRICT FKs — a hard delete
-- would fail anyway). Reversible via Restore. Set via UPDATE — the existing
-- "Admin can update mover profiles" policy already permits it (no new policy needed).
alter table mover_profiles
  add column if not exists deleted_at timestamptz;

-- ── Repoint worker_payouts.worker_id: workers(id) → profiles(id) ─────────────
alter table worker_payouts drop constraint if exists worker_payouts_worker_id_fkey;
alter table worker_payouts
  add constraint worker_payouts_worker_id_fkey
  foreign key (worker_id) references profiles(id) on delete cascade;

-- ── Repoint job_crew.worker_id: workers(id) → profiles(id) ───────────────────
alter table job_crew drop constraint if exists job_crew_worker_id_fkey;
alter table job_crew
  add constraint job_crew_worker_id_fkey
  foreign key (worker_id) references profiles(id) on delete cascade;

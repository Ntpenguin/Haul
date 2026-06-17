-- 059: Teams — reusable named crews of workers (app movers in `profiles`).
-- An admin-only grouping for one-click crew assignment to a gig. A worker can
-- belong to MULTIPLE teams (join table). Distinct from `businesses` (employer
-- orgs, migration 043) — a team is an internal dispatch/crew grouping.
--
-- Assigning a team to a gig (admin UI) bulk-inserts each member into job_crew
-- (migration 055; worker_id -> profiles since 057) and emails each via the
-- notify-worker-assigned edge fn. No new payout wiring — crew pay stays in the
-- Crew & pay ledger.

create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  team_id    uuid not null references teams(id)    on delete cascade,
  worker_id  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, worker_id)
);
create index if not exists team_members_worker_idx on team_members(worker_id);

alter table teams        enable row level security;
alter table team_members enable row level security;

drop policy if exists "Admins manage teams" on teams;
create policy "Admins manage teams" on teams
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Admins manage team members" on team_members;
create policy "Admins manage team members" on team_members
  for all to authenticated using (is_admin()) with check (is_admin());

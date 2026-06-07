-- 055: Crew assignment — link loginless crew (workers, migration 054) to gigs
-- for planning/dispatch. Admin-only; no app-facing exposure.

create table if not exists job_crew (
  id         uuid primary key default gen_random_uuid(),
  gig_id     uuid not null references gigs(id)    on delete cascade,
  worker_id  uuid not null references workers(id) on delete cascade,
  role       text,                                 -- optional: 'lead' / 'helper'
  created_at timestamptz not null default now(),
  unique (gig_id, worker_id)
);
create index if not exists job_crew_gig_idx    on job_crew(gig_id);
create index if not exists job_crew_worker_idx on job_crew(worker_id);

alter table job_crew enable row level security;

drop policy if exists "Admins manage job crew" on job_crew;
create policy "Admins manage job crew" on job_crew
  for all to authenticated using (is_admin()) with check (is_admin());

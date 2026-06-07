-- 054: Loginless crew roster + manual payout ledger (admin-managed).
--
-- These "workers" are NOT app users — no auth login, no Stripe Connect. They are
-- a roster of crew the owner onboards directly and pays by cash/Venmo/Zelle.
-- Separate from `mover_profiles` (app-registered independent movers). The admin
-- logs a payout per job worked (optionally linked to a gig), then marks it paid.
--
-- Admin-only RLS via is_admin() (migration 034). No anon / public access.

create table if not exists workers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text,
  email         text,
  payout_handle text,                       -- Venmo / Zelle / etc.
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists worker_payouts (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  gig_id       uuid references gigs(id) on delete set null,   -- job worked (optional)
  amount_cents integer not null check (amount_cents >= 0),
  status       text not null default 'owed' check (status in ('owed','paid')),
  note         text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists worker_payouts_worker_idx on worker_payouts(worker_id);
create index if not exists worker_payouts_gig_idx    on worker_payouts(gig_id);

alter table workers        enable row level security;
alter table worker_payouts enable row level security;

drop policy if exists "Admins manage workers" on workers;
create policy "Admins manage workers" on workers
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Admins manage worker payouts" on worker_payouts;
create policy "Admins manage worker payouts" on worker_payouts
  for all to authenticated using (is_admin()) with check (is_admin());

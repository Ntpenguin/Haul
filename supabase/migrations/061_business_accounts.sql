-- 061: Self-service business accounts — tie a login to the existing `businesses`
-- table (migration 043) so a company can sign up once and have their B2B request
-- form (landing/business.html) auto-fill + save the details they repeat every job.
--
-- `businesses` was admin-managed only (employer orgs). This adds:
--   • auth_user_id — links a businesses row to a Supabase auth user (one per account)
--   • saved "default" profile fields the form prefills + writes back on submit
--   • RLS so a logged-in business owner can read/update ONLY their own row
-- Admin-created businesses keep auth_user_id NULL; the admin-all policy is unchanged.
-- Self-service signups are created (service role) by the register-business edge fn.

alter table businesses add column if not exists auth_user_id        uuid references auth.users(id) on delete cascade;
alter table businesses add column if not exists contact_name        text;
alter table businesses add column if not exists default_address     text;
alter table businesses add column if not exists default_access_notes text;
alter table businesses add column if not exists default_stairs      boolean not null default false;
alter table businesses add column if not exists default_elevator    boolean not null default false;
alter table businesses add column if not exists default_long_walk   boolean not null default false;

-- One business row per auth account.
create unique index if not exists businesses_auth_user_idx
  on businesses(auth_user_id) where auth_user_id is not null;

-- ── RLS: a business owner reads / inserts / updates ONLY their own row ──────────
-- (Admin-all policy "Admins manage businesses" from 043 stays in place.)
drop policy if exists "Business owner reads own" on businesses;
create policy "Business owner reads own" on businesses
  for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists "Business owner inserts own" on businesses;
create policy "Business owner inserts own" on businesses
  for insert to authenticated with check (auth_user_id = auth.uid());

drop policy if exists "Business owner updates own" on businesses;
create policy "Business owner updates own" on businesses
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

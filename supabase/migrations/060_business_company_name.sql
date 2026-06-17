-- 060: business_jobs.company_name — the company/organization the B2B request is for.
-- The plain request form (landing/business.html → submit-business-job) already
-- captures a contact name + phone; this adds the optional business/company name so
-- the admin Business Jobs tab can show who the job is for. Nullable, free text.

alter table business_jobs add column if not exists company_name text;

-- Migration 051 — referrer payout handle (Venmo / Zelle) for the referral program.
-- Captured when creating a referral code; denormalized onto the referrals ledger
-- (like referrer_name/email/phone) so the admin's "Payouts owed" table shows exactly
-- where to send the $20.

ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS payout_handle text;
ALTER TABLE referrals      ADD COLUMN IF NOT EXISTS payout_handle text;

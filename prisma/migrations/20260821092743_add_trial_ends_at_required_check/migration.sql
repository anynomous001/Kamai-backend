-- Structural guard against a permanent-free-access gap: write-access.ts's
-- requireWriteAccess only ever blocks a baker when trialEndsAt IS NOT
-- NULL. A non-ACTIVE, non-founder baker with trialEndsAt: null would
-- have permanent free write access with zero enforcement stopping it.
-- Not reachable today via any live signup/API path (confirmed: only
-- prisma/seed.ts and prisma/seed-real-demo.ts can set trialEndsAt to
-- null, and only ever paired with subscriptionStatus: 'ACTIVE' in
-- current seed data) - this constraint closes the gap at the DB layer
-- so no future code path (bug, migration, admin tool) can silently
-- create that combination.
--
-- Read-only check against live data before writing this migration
-- (2026-08-21) confirmed zero existing rows would violate it.
ALTER TABLE "bakers" ADD CONSTRAINT "bakers_trial_ends_at_required_check"
  CHECK (
    subscription_status = 'ACTIVE'
    OR is_founder_account = true
    OR trial_ends_at IS NOT NULL
  );

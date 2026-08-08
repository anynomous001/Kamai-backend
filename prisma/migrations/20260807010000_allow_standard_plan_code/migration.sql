-- 'STANDARD' is the new Rs199/month tier applied from the 150th paid
-- subscription onward (see 20260807000000_update_trial_length_and_pricing);
-- the original check only allowed the single 'EARLY_ADOPTER' plan code.
ALTER TABLE "bakers" DROP CONSTRAINT "bakers_subscription_plan_check";
ALTER TABLE "bakers" ADD CONSTRAINT "bakers_subscription_plan_check"
  CHECK ("subscription_plan" IS NULL OR "subscription_plan" IN ('EARLY_ADOPTER', 'STANDARD'));

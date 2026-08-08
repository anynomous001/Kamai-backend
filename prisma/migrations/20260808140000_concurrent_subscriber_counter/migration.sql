-- Threshold pricing is now based on a live count of currently-ACTIVE
-- Rs149 subscribers (concurrent, not a lifetime tally): a cancellation
-- frees the slot back up for the next subscriber. The previous
-- monotonic sequence approach could never free a slot, and - more
-- importantly - incremented the moment a baker clicked "subscribe",
-- before Razorpay's checkout page even loaded, so an abandoned/
-- unauthorized checkout permanently consumed a slot. Concurrency safety
-- is now handled by an advisory lock (pg_advisory_xact_lock) around the
-- count+decide step in billing.service.ts instead of the sequence.
DROP SEQUENCE IF EXISTS "paid_subscription_counter";

-- Founder/test accounts: excluded from the ACTIVE-Rs149-subscriber count
-- so internal testing/demo use never occupies a real early-adopter slot.
ALTER TABLE "bakers" ADD COLUMN "exclude_from_subscriber_count" BOOLEAN NOT NULL DEFAULT false;

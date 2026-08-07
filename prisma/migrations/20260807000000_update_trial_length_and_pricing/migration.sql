-- Trial length: 90 days -> 30 days (only affects new bakers going forward;
-- existing bakers' already-computed trial_ends_at values are untouched).
ALTER TABLE "bakers" ALTER COLUMN "trial_ends_at" SET DEFAULT (now() + interval '30 days');

-- Price actually locked in at subscription-creation time, per baker.
ALTER TABLE "bakers" ADD COLUMN "locked_monthly_price" DECIMAL(10, 2);

-- Global, atomically-incrementing counter for threshold pricing: the
-- first 149 paid subscriptions ever created get the sequence values
-- 1..149 (locked at Rs149/month); everything from nextval() = 150 onward
-- is Rs199/month. A Postgres sequence's nextval() is atomic and safe
-- under concurrency without an explicit row lock, which is what prevents
-- two bakers subscribing at nearly the same moment from both landing
-- under the threshold when only one slot remains (see
-- billing.service.ts createSubscription).
--
-- Sequence values are NOT transactional (a rolled-back transaction does
-- not return its reserved number) - a subscription-creation attempt that
-- reserves a number and then fails before completing (e.g. the Razorpay
-- API call itself fails) permanently consumes that number. This is a
-- deliberate, accepted tradeoff: the alternative (only counting confirmed
-- webhook activations) would reopen the exact race this sequence exists
-- to prevent, since pricing must be decided at subscription-creation
-- time, before any webhook can possibly have fired.
CREATE SEQUENCE "paid_subscription_counter" START 1;

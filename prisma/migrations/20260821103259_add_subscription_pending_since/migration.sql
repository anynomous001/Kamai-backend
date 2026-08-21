-- Additive only: nullable column, no default computation, no rewrite of
-- existing rows' meaningful data. Existing PENDING rows (if any) will
-- read as NULL here; createSubscription's guard treats a NULL
-- subscriptionPendingSince on a PENDING baker as immediately eligible
-- for retry (unknown age is not treated as "freshly in flight").
ALTER TABLE "bakers" ADD COLUMN "subscription_pending_since" TIMESTAMP(3);

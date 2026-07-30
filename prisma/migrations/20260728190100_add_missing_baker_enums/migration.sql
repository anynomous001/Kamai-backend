-- Backfills another migration-history gap found while testing a full
-- replay against a genuinely empty database: "CollectionMethod" and
-- "SubscriptionPlan" were used by the pre-redesign "Baker" table (added
-- out-of-band via `prisma db push`, never captured in a migration) and
-- are dropped by 20260729000000_baker_ops_v2_redesign's DROP TYPE
-- statements, which requires them to already exist. Values match the
-- last pre-redesign schema.prisma. The old "Baker" table itself is
-- recreated wholesale by the redesign migration (DROP TABLE, not ALTER),
-- so its exact historical column set doesn't need to be reconstructed —
-- only these two enum types are actually required for a clean replay.

-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('UPI', 'QR');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('EARLY_ADOPTER');

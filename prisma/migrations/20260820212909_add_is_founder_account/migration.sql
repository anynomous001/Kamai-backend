-- Adds a founder/internal-account bypass flag to bakers. Additive only:
-- NOT NULL with a fixed DEFAULT false backfills every existing row and
-- carries no data-loss risk (Postgres treats this as a metadata-only
-- change, no table rewrite, for a constant default). Never set through
-- any API route - see write-access.ts and schema.prisma comments.
ALTER TABLE "bakers" ADD COLUMN "is_founder_account" BOOLEAN NOT NULL DEFAULT false;

-- Same fix as 20260729010000_orders_per_tenant_display_id, applied to
-- customers and investments: display_id must reflect a baker's own
-- volume, not a platform-wide count. Identical pattern — a per-baker
-- counter table per entity, updated via an atomic upsert so concurrent
-- inserts for the same baker serialize on the row lock instead of
-- racing, and uniqueness scoped to (baker_id, display_id) instead of
-- global.

-- ── customers ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS "trg_customers_display_id" ON "customers";
DROP SEQUENCE IF EXISTS "customers_display_id_seq";

DROP INDEX IF EXISTS "customers_display_id_key";
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_baker_id_display_id_key";
ALTER TABLE "customers" ADD CONSTRAINT "customers_baker_id_display_id_key" UNIQUE ("baker_id", "display_id");

DROP TABLE IF EXISTS "customer_display_id_counters";
CREATE TABLE "customer_display_id_counters" (
    "baker_id" TEXT NOT NULL,
    "next_val" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "customer_display_id_counters_pkey" PRIMARY KEY ("baker_id"),
    CONSTRAINT "customer_display_id_counters_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION set_customer_display_id() RETURNS TRIGGER AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  IF NEW.display_id IS NULL THEN
    INSERT INTO "customer_display_id_counters" ("baker_id", "next_val")
    VALUES (NEW.baker_id, 1)
    ON CONFLICT ("baker_id") DO UPDATE SET "next_val" = "customer_display_id_counters"."next_val" + 1
    RETURNING "next_val" INTO seq_val;

    NEW.display_id := 'CUS-' || LPAD(seq_val::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_customers_display_id" BEFORE INSERT ON "customers"
  FOR EACH ROW EXECUTE FUNCTION set_customer_display_id();

-- ── investments ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS "trg_investments_display_id" ON "investments";
DROP SEQUENCE IF EXISTS "investments_display_id_seq";

DROP INDEX IF EXISTS "investments_display_id_key";
ALTER TABLE "investments" DROP CONSTRAINT IF EXISTS "investments_baker_id_display_id_key";
ALTER TABLE "investments" ADD CONSTRAINT "investments_baker_id_display_id_key" UNIQUE ("baker_id", "display_id");

DROP TABLE IF EXISTS "investment_display_id_counters";
CREATE TABLE "investment_display_id_counters" (
    "baker_id" TEXT NOT NULL,
    "next_val" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "investment_display_id_counters_pkey" PRIMARY KEY ("baker_id"),
    CONSTRAINT "investment_display_id_counters_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION set_investment_display_id() RETURNS TRIGGER AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  IF NEW.display_id IS NULL THEN
    INSERT INTO "investment_display_id_counters" ("baker_id", "next_val")
    VALUES (NEW.baker_id, 1)
    ON CONFLICT ("baker_id") DO UPDATE SET "next_val" = "investment_display_id_counters"."next_val" + 1
    RETURNING "next_val" INTO seq_val;

    NEW.display_id := 'INV-' || LPAD(seq_val::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_investments_display_id" BEFORE INSERT ON "investments"
  FOR EACH ROW EXECUTE FUNCTION set_investment_display_id();

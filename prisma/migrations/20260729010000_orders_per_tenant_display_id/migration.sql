-- Orders display_id must be per-tenant, not platform-wide: a baker's
-- order codes should only reflect that baker's own order volume. The
-- previous trigger used a single global sequence shared by every baker
-- (ORD-000001, ORD-000002, ... counting across the whole platform) —
-- switching to a per-baker counter table with an atomic upsert instead.

-- 1. Drop the old global-sequence trigger + sequence for orders only
--    (bakers/customers/investments/payment_events/inventory_items keep
--    their existing global-sequence behavior; only orders changes here).
DROP TRIGGER IF EXISTS "trg_orders_display_id" ON "orders";
DROP SEQUENCE IF EXISTS "orders_display_id_seq";

-- 2. display_id uniqueness is now scoped per-baker, not global — two
--    different bakers can both have an "ORD-000001".
DROP INDEX IF EXISTS "orders_display_id_key";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_baker_id_display_id_key";
ALTER TABLE "orders" ADD CONSTRAINT "orders_baker_id_display_id_key" UNIQUE ("baker_id", "display_id");

-- 3. Per-baker counter, upserted atomically so concurrent inserts for the
--    same baker serialize on the row lock instead of racing.
DROP TABLE IF EXISTS "order_display_id_counters";
CREATE TABLE "order_display_id_counters" (
    "baker_id" TEXT NOT NULL,
    "next_val" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "order_display_id_counters_pkey" PRIMARY KEY ("baker_id"),
    CONSTRAINT "order_display_id_counters_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION set_order_display_id() RETURNS TRIGGER AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  IF NEW.display_id IS NULL THEN
    INSERT INTO "order_display_id_counters" ("baker_id", "next_val")
    VALUES (NEW.baker_id, 1)
    ON CONFLICT ("baker_id") DO UPDATE SET "next_val" = "order_display_id_counters"."next_val" + 1
    RETURNING "next_val" INTO seq_val;

    NEW.display_id := 'ORD-' || LPAD(seq_val::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_orders_display_id" BEFORE INSERT ON "orders"
  FOR EACH ROW EXECUTE FUNCTION set_order_display_id();

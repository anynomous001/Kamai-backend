-- Baker Operations Platform v2 schema redesign.
-- Replaces Baker/Customer/Order/PaymentLedger/Investment with
-- bakers/customers/orders/payment_events/investments (+ new inventory_items).
-- No live data existed in these tables at migration time.
-- RLS intentionally NOT enabled this round (see conversation record —
-- Prisma connects via the bypassrls "postgres" owner role and auth is a
-- custom JWT, not Supabase Auth, so table-level RLS would be cosmetic
-- until that's re-architected). baker_id scoping is enforced at the
-- application layer; see audit notes in DATABASE_CHANGELOG.md v1.0.0.

-- Clear session rows that would otherwise orphan-reference a dropped
-- bakers row. These are pre-existing manual/dev-testing refresh tokens,
-- not production sessions (per confirmed "no live data" for this
-- migration) — any logged-in dev session will simply need to log in
-- again after this runs.
DELETE FROM "RefreshToken";

-- DropForeignKey
ALTER TABLE "BillingHistory" DROP CONSTRAINT "BillingHistory_bakerId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_bakerId_fkey";

-- DropForeignKey
ALTER TABLE "Investment" DROP CONSTRAINT "Investment_bakerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_bakerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentLedger" DROP CONSTRAINT "PaymentLedger_bakerId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentLedger" DROP CONSTRAINT "PaymentLedger_orderId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_bakerId_fkey";

-- DropTable
DROP TABLE "Baker";

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Investment";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "PaymentLedger";

-- DropEnum
DROP TYPE "BakerStatus";

-- DropEnum
DROP TYPE "CollectionMethod";

-- DropEnum
DROP TYPE "OrderStatus";

-- DropEnum
DROP TYPE "PaymentMode";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- DropEnum
DROP TYPE "TransactionType";

-- CreateTable
CREATE TABLE "bakers" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "business_name" TEXT,
    "owner_name" TEXT,
    "logo_path" TEXT,
    "default_advance_percentage" DECIMAL(5,2),
    "whatsapp_receipt_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fssai_number" VARCHAR(14),
    "fssai_verified" BOOLEAN NOT NULL DEFAULT false,
    "fssai_document_path" TEXT,
    "gst_number" TEXT,
    "upi_vpa" TEXT,
    "merchant_name" TEXT,
    "default_collection_method" TEXT NOT NULL DEFAULT 'UPI',
    "preferred_apps" JSONB NOT NULL DEFAULT '[]',
    "qr_code_enabled" BOOLEAN NOT NULL DEFAULT true,
    "subscription_status" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscription_plan" TEXT,
    "is_early_adopter" BOOLEAN NOT NULL DEFAULT true,
    "trial_ends_at" TIMESTAMP(3) DEFAULT (now() + interval '90 days'),
    "subscription_ends_at" TIMESTAMP(3),
    "next_billing_date" TIMESTAMP(3),
    "razorpay_customer_id" TEXT,
    "razorpay_subscription_id" TEXT,
    "razorpay_plan_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ONBOARDING',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "preferred_delivery_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "cake_category" TEXT NOT NULL,
    "cake_flavour" TEXT NOT NULL,
    "weight_in_pounds" DECIMAL(10,3),
    "quantity" DECIMAL(10,3),
    "occasion" TEXT,
    "custom_instructions" TEXT,
    "delivery_type" TEXT NOT NULL,
    "delivery_date" DATE NOT NULL,
    "delivery_time" TIME,
    "delivery_charge" DECIMAL(10,2),
    "total_price" DECIMAL(10,2) NOT NULL,
    "advance_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(10,2) NOT NULL,
    "order_status" TEXT NOT NULL DEFAULT 'Pending',
    "payment_status" TEXT NOT NULL DEFAULT 'Unpaid',
    "reference_photo_url" TEXT,
    "internal_notes" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "order_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "event_type" TEXT NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "transaction_reference" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "material_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "price_per_unit" DECIMAL(10,2) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "supplier_name" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "current_stock" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "low_stock_threshold" DECIMAL(10,3),
    "supplier_name" TEXT,
    "last_purchase_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bakers_display_id_key" ON "bakers"("display_id");

-- CreateIndex
CREATE UNIQUE INDEX "bakers_email_key" ON "bakers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bakers_razorpay_subscription_id_key" ON "bakers"("razorpay_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_display_id_key" ON "customers"("display_id");

-- CreateIndex
CREATE INDEX "customers_baker_id_idx" ON "customers"("baker_id");

-- CreateIndex
CREATE INDEX "customers_baker_id_name_idx" ON "customers"("baker_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_baker_id_phone_key" ON "customers"("baker_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "orders_display_id_key" ON "orders"("display_id");

-- CreateIndex
CREATE INDEX "orders_baker_id_order_status_idx" ON "orders"("baker_id", "order_status");

-- CreateIndex
CREATE INDEX "orders_baker_id_delivery_date_idx" ON "orders"("baker_id", "delivery_date");

-- CreateIndex
CREATE INDEX "orders_baker_id_payment_status_idx" ON "orders"("baker_id", "payment_status");

-- CreateIndex
CREATE INDEX "orders_baker_id_created_at_idx" ON "orders"("baker_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_baker_id_balance_due_idx" ON "orders"("baker_id", "balance_due" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_display_id_key" ON "payment_events"("display_id");

-- CreateIndex
CREATE INDEX "payment_events_baker_id_order_id_idx" ON "payment_events"("baker_id", "order_id");

-- CreateIndex
CREATE INDEX "payment_events_baker_id_occurred_at_idx" ON "payment_events"("baker_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "investments_display_id_key" ON "investments"("display_id");

-- CreateIndex
CREATE INDEX "investments_baker_id_purchase_date_idx" ON "investments"("baker_id", "purchase_date");

-- CreateIndex
CREATE INDEX "investments_baker_id_category_idx" ON "investments"("baker_id", "category");

-- CreateIndex
CREATE INDEX "investments_baker_id_material_name_idx" ON "investments"("baker_id", "material_name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_display_id_key" ON "inventory_items"("display_id");

-- CreateIndex
CREATE INDEX "inventory_items_baker_id_idx" ON "inventory_items"("baker_id");

-- CreateIndex
CREATE INDEX "inventory_items_baker_id_current_stock_idx" ON "inventory_items"("baker_id", "current_stock");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_bakerId_fkey" FOREIGN KEY ("bakerId") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_bakerId_fkey" FOREIGN KEY ("bakerId") REFERENCES "bakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- CHECK constraints
-- Only applied where the spec gave an explicit, closed vocabulary.
-- investments.category is deliberately left unconstrained free text —
-- no vocabulary was specified for it and it's meant to evolve.
-- ============================================================

ALTER TABLE "bakers" ADD CONSTRAINT "bakers_default_advance_percentage_check"
  CHECK ("default_advance_percentage" IS NULL OR ("default_advance_percentage" >= 0 AND "default_advance_percentage" <= 100));

ALTER TABLE "bakers" ADD CONSTRAINT "bakers_subscription_status_check"
  CHECK ("subscription_status" IN ('TRIAL','PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED'));

ALTER TABLE "bakers" ADD CONSTRAINT "bakers_subscription_plan_check"
  CHECK ("subscription_plan" IS NULL OR "subscription_plan" IN ('EARLY_ADOPTER'));

ALTER TABLE "bakers" ADD CONSTRAINT "bakers_default_collection_method_check"
  CHECK ("default_collection_method" IN ('UPI','QR'));

ALTER TABLE "bakers" ADD CONSTRAINT "bakers_status_check"
  CHECK ("status" IN ('PENDING_ONBOARDING','ACTIVE','SUSPENDED'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_type_check"
  CHECK ("delivery_type" IN ('pickup','delivery'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_order_status_check"
  CHECK ("order_status" IN ('Pending','Confirmed','In Progress','Ready','Delivered','Cancelled'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_check"
  CHECK ("payment_status" IN ('Unpaid','Partially Paid','Paid'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_charge_check"
  CHECK ("delivery_charge" IS NULL OR "delivery_charge" >= 0);

ALTER TABLE "orders" ADD CONSTRAINT "orders_total_price_check"
  CHECK ("total_price" > 0);

ALTER TABLE "orders" ADD CONSTRAINT "orders_advance_paid_check"
  CHECK ("advance_paid" >= 0 AND "advance_paid" <= "total_price");

ALTER TABLE "investments" ADD CONSTRAINT "investments_quantity_check"
  CHECK ("quantity" > 0);

ALTER TABLE "investments" ADD CONSTRAINT "investments_price_per_unit_check"
  CHECK ("price_per_unit" > 0);

ALTER TABLE "investments" ADD CONSTRAINT "investments_total_cost_check"
  CHECK ("total_cost" > 0);

ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_event_type_check"
  CHECK ("event_type" IN ('advance_received','balance_received','refund'));

ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_mode_check"
  CHECK ("payment_mode" IN ('CASH','UPI','CARD','BANK_TRANSFER'));

ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_amount_check"
  CHECK ("amount" > 0);

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_current_stock_check"
  CHECK ("current_stock" >= 0);

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_low_stock_threshold_check"
  CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0);

-- ============================================================
-- display_id generation: one sequence per table + a shared trigger
-- function parameterized by (prefix, sequence name, zero-pad width).
-- Digit widths are sized for the seed volumes discussed (80-150
-- orders / 30-40 customers per baker, a handful of test bakers) with
-- headroom, not literal copies of the spec's illustrative examples.
-- ============================================================

CREATE OR REPLACE FUNCTION set_display_id() RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT := TG_ARGV[0];
  seq_name TEXT := TG_ARGV[1];
  pad_width INT := TG_ARGV[2]::INT;
  next_val BIGINT;
BEGIN
  IF NEW.display_id IS NULL THEN
    next_val := nextval(seq_name);
    NEW.display_id := prefix || '-' || LPAD(next_val::TEXT, pad_width, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE "bakers_display_id_seq";
CREATE TRIGGER "trg_bakers_display_id" BEFORE INSERT ON "bakers"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('BAKER', 'bakers_display_id_seq', 3);

CREATE SEQUENCE "customers_display_id_seq";
CREATE TRIGGER "trg_customers_display_id" BEFORE INSERT ON "customers"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('CUS', 'customers_display_id_seq', 4);

CREATE SEQUENCE "orders_display_id_seq";
CREATE TRIGGER "trg_orders_display_id" BEFORE INSERT ON "orders"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('ORD', 'orders_display_id_seq', 6);

CREATE SEQUENCE "investments_display_id_seq";
CREATE TRIGGER "trg_investments_display_id" BEFORE INSERT ON "investments"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('INV', 'investments_display_id_seq', 4);

CREATE SEQUENCE "payment_events_display_id_seq";
CREATE TRIGGER "trg_payment_events_display_id" BEFORE INSERT ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('PAY', 'payment_events_display_id_seq', 6);

CREATE SEQUENCE "inventory_items_display_id_seq";
CREATE TRIGGER "trg_inventory_items_display_id" BEFORE INSERT ON "inventory_items"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('ITM', 'inventory_items_display_id_seq', 4);

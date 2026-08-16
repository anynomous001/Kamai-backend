-- Make Order.customer_id nullable to support fully anonymous walk-in
-- sales (no name, no phone) that skip customer-record creation entirely.
ALTER TABLE "orders" ALTER COLUMN "customer_id" DROP NOT NULL;

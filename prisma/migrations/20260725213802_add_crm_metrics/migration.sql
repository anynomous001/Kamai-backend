-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastOrderDate" TIMESTAMP(3),
ADD COLUMN     "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalOrders" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Order_customerId_status_idx" ON "Order"("customerId", "status");

-- CreateIndex
CREATE INDEX "Order_customerId_deliveryDate_idx" ON "Order"("customerId", "deliveryDate");

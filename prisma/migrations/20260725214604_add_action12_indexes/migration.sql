-- CreateIndex
CREATE INDEX "Customer_bakerId_name_idx" ON "Customer"("bakerId", "name");

-- CreateIndex
CREATE INDEX "Customer_bakerId_phone_idx" ON "Customer"("bakerId", "phone");

-- CreateIndex
CREATE INDEX "Customer_lastOrderDate_idx" ON "Customer"("lastOrderDate");

-- CreateIndex
CREATE INDEX "Order_customerId_balanceDue_idx" ON "Order"("customerId", "balanceDue");

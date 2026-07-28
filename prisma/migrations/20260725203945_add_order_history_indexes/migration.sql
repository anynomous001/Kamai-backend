-- CreateIndex
CREATE INDEX "Order_bakerId_status_idx" ON "Order"("bakerId", "status");

-- CreateIndex
CREATE INDEX "Order_bakerId_deliveryDate_idx" ON "Order"("bakerId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_bakerId_createdAt_idx" ON "Order"("bakerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_bakerId_orderNumber_idx" ON "Order"("bakerId", "orderNumber");

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "bakerId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "pricePerUnit" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "supplier" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investment_bakerId_purchaseDate_idx" ON "Investment"("bakerId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Investment_bakerId_materialName_idx" ON "Investment"("bakerId", "materialName");

-- CreateIndex
CREATE INDEX "Investment_purchaseDate_idx" ON "Investment"("purchaseDate");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_bakerId_fkey" FOREIGN KEY ("bakerId") REFERENCES "Baker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

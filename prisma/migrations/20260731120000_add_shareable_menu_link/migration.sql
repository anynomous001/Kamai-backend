-- Action 26: Shareable Menu Link

-- AlterTable: bakers
ALTER TABLE "bakers" ADD COLUMN "menu_slug" TEXT;
ALTER TABLE "bakers" ADD COLUMN "menu_slug_edited_at" TIMESTAMP(3);
ALTER TABLE "bakers" ADD COLUMN "whatsapp_number" TEXT;

CREATE UNIQUE INDEX "bakers_menu_slug_key" ON "bakers"("menu_slug");

-- CreateTable: menu_items
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "baker_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,
    "photo_path" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_items_baker_id_sort_order_idx" ON "menu_items"("baker_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_items_baker_id_is_available_idx" ON "menu_items"("baker_id", "is_available");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_baker_id_fkey" FOREIGN KEY ("baker_id") REFERENCES "bakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_check"
  CHECK ("price" > 0);

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_unit_check"
  CHECK ("unit" IN ('per_kg','per_piece','per_box','per_dozen'));

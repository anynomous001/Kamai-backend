-- Adds an optional receipt-photo storage path to investments (expense
-- ledger entries). Additive only: nullable, no default, no data-loss risk
-- (metadata-only change, no table rewrite). Stores a Supabase Storage path
-- (category=INVESTMENT_RECEIPT), not a URL — a signed read URL is
-- generated fresh on every GET, matching menu_items.photo_path / bakers'
-- logo_path. Never populated for existing rows.
ALTER TABLE "investments" ADD COLUMN "receipt_photo_path" TEXT;

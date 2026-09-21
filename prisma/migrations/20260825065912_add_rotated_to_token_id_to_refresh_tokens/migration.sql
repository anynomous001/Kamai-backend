-- Adds an optional pointer from a revoked-by-rotation RefreshToken row to
-- the row that replaced it. Additive only: nullable, no default, no
-- data-loss risk. Used by authService.refreshSession's grace-window logic
-- to identify a benign concurrent-refresh race (the row was revoked
-- because it was rotated into a new session) versus a genuine replayed/
-- stolen token. Never populated for existing rows.
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedToTokenId" TEXT;

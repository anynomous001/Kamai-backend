-- CRITICAL FIX: the bakers table's display_id trigger used a 3-digit
-- pad width (LPAD(nextval::text, 3, '0')), sized under the assumption
-- baker count would stay under 1000. LPAD truncates rather than expands
-- when the input is already longer than the target width, so once
-- bakers_display_id_seq exceeded 999, every group of 10 consecutive
-- sequence values collapsed onto the same 3-character string (e.g.
-- 1010-1019 all produce '101'), causing a real unique-constraint
-- failure on roughly 1 in 10 baker signups. Confirmed via direct
-- testing: nextval() itself increments correctly; LPAD is what silently
-- discards the leading digits.
--
-- This only changes the trigger's pad-width ARGUMENT for future
-- inserts. It does not touch existing rows or their stored display_id
-- values (already-generated BAKER-XXX strings like BAKER-280 are plain
-- stored text, not recomputed) - purely additive/forward-looking, safe
-- to apply without a data backfill.
DROP TRIGGER "trg_bakers_display_id" ON "bakers";
CREATE TRIGGER "trg_bakers_display_id" BEFORE INSERT ON "bakers"
  FOR EACH ROW EXECUTE FUNCTION set_display_id('BAKER', 'bakers_display_id_seq', 6);

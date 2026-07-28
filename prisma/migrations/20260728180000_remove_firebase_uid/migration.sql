-- DropIndex
DROP INDEX IF EXISTS "Baker_firebaseUid_key";

-- AlterTable
ALTER TABLE "Baker" DROP COLUMN IF EXISTS "firebaseUid";

-- A scholarship is now a percent off the 6 Month plan instead of class credits.
-- AlterTable
ALTER TABLE "ScholarshipCode" ADD COLUMN     "percent" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "credits" DROP NOT NULL;

-- A code made under the old class-credit design has no percent and cannot be used: end the unclaimed ones.
UPDATE "ScholarshipCode" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "percent" = 0 AND "claimedAt" IS NULL AND "revokedAt" IS NULL;

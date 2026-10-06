-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailCanonical" TEXT;

-- Backfill: Gmail ignores dots and plus tags, every other domain is kept as written.
UPDATE "User"
SET "emailCanonical" = CASE
  WHEN lower(split_part("email", '@', 2)) IN ('gmail.com', 'googlemail.com')
    THEN replace(split_part(lower(split_part("email", '@', 1)), '+', 1), '.', '') || '@gmail.com'
  ELSE lower("email")
END;

-- CreateIndex
CREATE INDEX "User_emailCanonical_idx" ON "User"("emailCanonical");

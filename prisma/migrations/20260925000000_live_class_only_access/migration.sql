-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- Curriculum now comes only with live classes. Every existing
-- hasCurriculumAccess flag was an admin grant (no real curriculum purchase
-- was ever made), so clear them: students are treated as new and get access
-- by starting a Payment Plan. Admins are untouched (they bypass the flag).
UPDATE "User"
SET "hasCurriculumAccess" = false,
    "curriculumUnlockedAt" = NULL
WHERE "role" <> 'ADMIN';

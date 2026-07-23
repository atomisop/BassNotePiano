-- CreateEnum
CREATE TYPE "BadgeCode" AS ENUM ('FIRST_LESSON_DONE', 'SCALE_MASTER', 'RHYTHM_SPECIALIST', 'CHORD_MAESTRO', 'COURSE_GRADUATE', 'FIRST_FRIEND_ADDED', 'COMMUNITY_CATALYST', 'ACTIVE_PRACTICE_PARTNER', 'STREAK_3_DAY', 'STREAK_7_DAY', 'STREAK_30_DAY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityDate" TIMESTAMP(3),
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" "BadgeCode" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_code_key" ON "UserBadge"("userId", "code");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

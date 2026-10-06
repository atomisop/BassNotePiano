-- AlterEnum
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_1';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_2';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_3';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_4';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_5';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_6';
ALTER TYPE "BadgeCode" ADD VALUE 'FINGER_LEVEL_7';

-- CreateTable
CREATE TABLE "FingerPracticeDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "lastBeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FingerPracticeDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FingerPracticeDay_userId_completedAt_idx" ON "FingerPracticeDay"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FingerPracticeDay_userId_day_key" ON "FingerPracticeDay"("userId", "day");

-- AddForeignKey
ALTER TABLE "FingerPracticeDay" ADD CONSTRAINT "FingerPracticeDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

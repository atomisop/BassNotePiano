-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('ONLINE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "LessonBookingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LESSON_BOOKING_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'LESSON_BOOKING_CANCELED';

-- AlterEnum
-- Renamed rather than dropped+recreated so every existing ZellePayment row
-- (including old PRO_LIFETIME purchases) keeps a valid purpose instead of
-- failing the cast when the old label no longer exists in the new type.
ALTER TYPE "PaymentPurpose" RENAME VALUE 'PRO_LIFETIME' TO 'CURRICULUM';
ALTER TYPE "PaymentPurpose" ADD VALUE 'LESSON_PACKAGE';

-- AlterTable
-- Renamed rather than dropped+recreated so every existing user's access
-- flag/timestamp survives the migration instead of resetting to defaults.
ALTER TABLE "User" RENAME COLUMN "isProMember" TO "hasCurriculumAccess";
ALTER TABLE "User" RENAME COLUMN "proUnlockedAt" TO "curriculumUnlockedAt";
ALTER TABLE "User" ADD COLUMN     "lessonCreditsInPerson" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lessonCreditsOnline" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "lessonQuantity" INTEGER,
ADD COLUMN     "lessonType" "LessonType";

-- CreateTable
CREATE TABLE "LessonBooking" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "LessonType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "meetingLink" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "status" "LessonBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "canceledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonBooking_studentId_status_idx" ON "LessonBooking"("studentId", "status");

-- CreateIndex
CREATE INDEX "LessonBooking_status_scheduledAt_idx" ON "LessonBooking"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "LessonBooking" ADD CONSTRAINT "LessonBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


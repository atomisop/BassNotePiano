-- CreateEnum
CREATE TYPE "ClassBookingStatus" AS ENUM ('SCHEDULED', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'NO_SHOW');

-- Rename enum value in place (not a create-new-type-and-swap) so existing
-- ZellePayment rows with purpose = 'LESSON_PACKAGE' keep resolving to the
-- same row under the new name, instead of failing the cast Prisma's default
-- diff would generate (LESSON_PACKAGE doesn't exist in a fresh enum that
-- only has CLASS_CREDITS).
ALTER TYPE "PaymentPurpose" RENAME VALUE 'LESSON_PACKAGE' TO 'CLASS_CREDITS';

-- Replace the online/in-person credit split with one unified pool.
-- Data-preserving: sum the two old balances into the new column before
-- dropping them, rather than Prisma's default drop-then-add (which would
-- silently zero out every existing student's credits).
ALTER TABLE "User" ADD COLUMN "classCredits" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "classCredits" = "lessonCreditsOnline" + "lessonCreditsInPerson";
ALTER TABLE "User" DROP COLUMN "lessonCreditsInPerson",
DROP COLUMN "lessonCreditsOnline";

-- CreateTable
CREATE TABLE "ClassSchedule" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassBooking" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "creditsSpent" INTEGER NOT NULL,
    "status" "ClassBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attendance" "AttendanceStatus",
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "canceledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassSchedule_dayOfWeek_active_idx" ON "ClassSchedule"("dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "ClassBooking_scheduleId_occurrenceDate_status_idx" ON "ClassBooking"("scheduleId", "occurrenceDate", "status");

-- CreateIndex
CREATE INDEX "ClassBooking_studentId_status_idx" ON "ClassBooking"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassBooking_studentId_scheduleId_occurrenceDate_key" ON "ClassBooking"("studentId", "scheduleId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

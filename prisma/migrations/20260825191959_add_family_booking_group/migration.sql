-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "familyBookingGroupId" TEXT;

-- CreateIndex
CREATE INDEX "ClassBooking_familyBookingGroupId_idx" ON "ClassBooking"("familyBookingGroupId");

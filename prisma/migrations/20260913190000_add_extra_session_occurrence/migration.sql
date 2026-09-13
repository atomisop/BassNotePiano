-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "extraSessionScheduleId" TEXT,
ADD COLUMN     "extraSessionOccurrenceDate" TIMESTAMP(3),
ADD COLUMN     "extraSessionScheduledAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_extraSessionScheduleId_fkey" FOREIGN KEY ("extraSessionScheduleId") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

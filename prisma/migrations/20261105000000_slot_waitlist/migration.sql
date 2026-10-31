-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SLOT_WAITLIST_OPENED';

-- CreateTable
CREATE TABLE "SlotWaitlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "SlotWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotWaitlist_scheduleId_chunkIndex_createdAt_idx" ON "SlotWaitlist"("scheduleId", "chunkIndex", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotWaitlist_userId_scheduleId_chunkIndex_key" ON "SlotWaitlist"("userId", "scheduleId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "SlotWaitlist" ADD CONSTRAINT "SlotWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotWaitlist" ADD CONSTRAINT "SlotWaitlist_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

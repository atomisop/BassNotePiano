-- CreateTable
CREATE TABLE "OwnerReservation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "chunkIndex" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerReservation_scheduleId_occurrenceDate_idx" ON "OwnerReservation"("scheduleId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "OwnerReservation_groupId_idx" ON "OwnerReservation"("groupId");

-- AddForeignKey
ALTER TABLE "OwnerReservation" ADD CONSTRAINT "OwnerReservation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

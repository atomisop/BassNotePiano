-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('INTERESTED', 'TRIAL', 'ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "instrument" "PrimaryInstrument",
    "skillLevel" "SkillLevel",
    "source" TEXT,
    "notes" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'INTERESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "until" DATE,
    "note" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSession" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_status_createdAt_idx" ON "Contact"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "SlotHold_scheduleId_chunkIndex_idx" ON "SlotHold"("scheduleId", "chunkIndex");

-- CreateIndex
CREATE INDEX "SlotHold_contactId_idx" ON "SlotHold"("contactId");

-- CreateIndex
CREATE INDEX "ContactSession_contactId_date_idx" ON "ContactSession"("contactId", "date");

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSession" ADD CONSTRAINT "ContactSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "ZellePaymentStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN "reminder24At" TIMESTAMP(3),
ADD COLUMN "reminder1hAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "refundNote" TEXT;

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PageHit" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_name_ranAt_idx" ON "JobRun"("name", "ranAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageHit_day_path_key" ON "PageHit"("day", "path");

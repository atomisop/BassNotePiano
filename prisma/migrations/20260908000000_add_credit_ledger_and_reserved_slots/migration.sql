-- CreateEnum
CREATE TYPE "CreditGrantSource" AS ENUM ('PAYMENT_PLAN_INSTALLMENT', 'FAMILY_BUNDLE', 'CLASS_CREDITS', 'ADMIN_ADJUSTMENT', 'PRE_LEDGER_BALANCE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CREDITS_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'RESERVED_SLOT_UNAVAILABLE';

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "reservedScheduleId" TEXT,
ADD COLUMN     "reservedChunkIndex" INTEGER,
ADD COLUMN     "reservedSlotInactiveNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "reservedByPlanId" TEXT;

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "CreditGrantSource" NOT NULL,
    "paymentPlanId" TEXT,
    "creditsGranted" INTEGER NOT NULL,
    "creditsRemaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditGrant_userId_creditsRemaining_idx" ON "CreditGrant"("userId", "creditsRemaining");

-- CreateIndex
CREATE INDEX "CreditGrant_expiresAt_idx" ON "CreditGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "CreditGrant_paymentPlanId_idx" ON "CreditGrant"("paymentPlanId");

-- CreateIndex
CREATE INDEX "PaymentPlan_reservedScheduleId_reservedChunkIndex_status_idx" ON "PaymentPlan"("reservedScheduleId", "reservedChunkIndex", "status");

-- CreateIndex
CREATE INDEX "ClassBooking_reservedByPlanId_idx" ON "ClassBooking"("reservedByPlanId");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_reservedScheduleId_fkey" FOREIGN KEY ("reservedScheduleId") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_reservedByPlanId_fkey" FOREIGN KEY ("reservedByPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: backfill one CreditGrant per existing non-zero balance so
-- the ledger has full historical coverage from day one, not just for
-- credits granted after this migration. Source PRE_LEDGER_BALANCE and a
-- null expiresAt (non-expiring): these balances predate both the ledger and
-- the Payment-Plan-credits-expire model entirely, so there's no real record
-- of which of them came from an expiring source vs. a non-expiring one —
-- grandfathered as non-expiring rather than guessed at.
INSERT INTO "CreditGrant" ("id", "userId", "source", "creditsGranted", "creditsRemaining", "expiresAt", "grantedAt", "createdAt")
SELECT gen_random_uuid()::text, "id", 'PRE_LEDGER_BALANCE', "classCredits", "classCredits", NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" WHERE "classCredits" > 0;

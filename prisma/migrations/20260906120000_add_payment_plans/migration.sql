-- CreateEnum
CREATE TYPE "PaymentPlanCadence" AS ENUM ('MIN_30_WEEKLY', 'MIN_60_WEEKLY');

-- CreateEnum
CREATE TYPE "PaymentPlanTerm" AS ENUM ('TERM_3', 'TERM_6', 'TERM_12');

-- CreateEnum
CREATE TYPE "PaymentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PLAN_INSTALLMENT_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PLAN_INSTALLMENT_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PLAN_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PLAN_CANCELED';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'PAYMENT_PLAN_INSTALLMENT';

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "paymentPlanId" TEXT;

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cadence" "PaymentPlanCadence" NOT NULL,
    "term" "PaymentPlanTerm" NOT NULL,
    "installmentAmountCents" INTEGER NOT NULL,
    "creditsPerInstallment" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "installmentsPaid" INTEGER NOT NULL DEFAULT 0,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancellationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentPlan_userId_idx" ON "PaymentPlan"("userId");

-- CreateIndex
CREATE INDEX "PaymentPlan_status_nextDueDate_idx" ON "PaymentPlan"("status", "nextDueDate");

-- CreateIndex
CREATE INDEX "ZellePayment_paymentPlanId_idx" ON "ZellePayment"("paymentPlanId");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

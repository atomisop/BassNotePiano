-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pauseUntil" TIMESTAMP(3);

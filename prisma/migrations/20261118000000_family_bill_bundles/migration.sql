-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'FAMILY_PLAN_INSTALLMENT';

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "bundleId" TEXT;

-- CreateIndex
CREATE INDEX "ZellePayment_bundleId_idx" ON "ZellePayment"("bundleId");

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ZellePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

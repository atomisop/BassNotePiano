-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'PHONE_VERIFY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pendingPhone" TEXT;

-- AlterTable
ALTER TABLE "ProcessedPaymentEmail" ADD COLUMN     "senderPhone" TEXT,
ADD COLUMN     "senderPhoneLast4" TEXT;

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

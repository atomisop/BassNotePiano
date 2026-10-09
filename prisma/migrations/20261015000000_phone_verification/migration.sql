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

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "senderPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

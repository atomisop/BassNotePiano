-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'FAMILY_BUNDLE';

-- CreateTable
CREATE TABLE "FamilyBundleRecipient" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyBundleRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyBundleRecipient_paymentId_idx" ON "FamilyBundleRecipient"("paymentId");

-- CreateIndex
CREATE INDEX "FamilyBundleRecipient_userId_idx" ON "FamilyBundleRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyBundleRecipient_paymentId_userId_key" ON "FamilyBundleRecipient"("paymentId", "userId");

-- AddForeignKey
ALTER TABLE "FamilyBundleRecipient" ADD CONSTRAINT "FamilyBundleRecipient_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ZellePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyBundleRecipient" ADD CONSTRAINT "FamilyBundleRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

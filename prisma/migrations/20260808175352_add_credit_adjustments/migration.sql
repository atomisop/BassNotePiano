-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CREDIT_ADJUSTED';

-- CreateTable
CREATE TABLE "CreditAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adjustedById" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reasonNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditAdjustment_userId_createdAt_idx" ON "CreditAdjustment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditAdjustment_createdAt_idx" ON "CreditAdjustment"("createdAt");

-- AddForeignKey
ALTER TABLE "CreditAdjustment" ADD CONSTRAINT "CreditAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAdjustment" ADD CONSTRAINT "CreditAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

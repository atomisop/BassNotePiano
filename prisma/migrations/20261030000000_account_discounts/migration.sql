-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "listAmountCents" INTEGER;

-- CreateTable
CREATE TABLE "AccountDiscount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDiscount_userId_key" ON "AccountDiscount"("userId");

-- AddForeignKey
ALTER TABLE "AccountDiscount" ADD CONSTRAINT "AccountDiscount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDiscount" ADD CONSTRAINT "AccountDiscount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

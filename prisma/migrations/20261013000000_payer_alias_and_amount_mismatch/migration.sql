-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_AMOUNT_MISMATCH';

-- CreateTable
CREATE TABLE "PayerAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayerAlias_userId_name_key" ON "PayerAlias"("userId", "name");

-- AddForeignKey
ALTER TABLE "PayerAlias" ADD CONSTRAINT "PayerAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecretEnc" TEXT;

-- CreateTable
CREATE TABLE "AdminBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminBackupCode_userId_codeHash_idx" ON "AdminBackupCode"("userId", "codeHash");

-- AddForeignKey
ALTER TABLE "AdminBackupCode" ADD CONSTRAINT "AdminBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

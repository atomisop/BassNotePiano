-- AlterEnum
ALTER TYPE "CreditGrantSource" ADD VALUE 'SCHOLARSHIP';

-- CreateTable
CREATE TABLE "ScholarshipCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assignedEmail" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScholarshipCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScholarshipCode_code_key" ON "ScholarshipCode"("code");

-- CreateIndex
CREATE INDEX "ScholarshipCode_assignedEmail_idx" ON "ScholarshipCode"("assignedEmail");

-- AddForeignKey
ALTER TABLE "ScholarshipCode" ADD CONSTRAINT "ScholarshipCode_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScholarshipCode" ADD CONSTRAINT "ScholarshipCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'FAMILY_PLAN_START';

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "familyGroupId" TEXT;

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "familyGroupId" TEXT;

-- CreateTable
CREATE TABLE "FamilyPlanGroup" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyPlanGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyPlanGroup_payerId_idx" ON "FamilyPlanGroup"("payerId");

-- CreateIndex
CREATE INDEX "PaymentPlan_familyGroupId_idx" ON "PaymentPlan"("familyGroupId");

-- CreateIndex
CREATE INDEX "ZellePayment_familyGroupId_idx" ON "ZellePayment"("familyGroupId");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyPlanGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPlanGroup" ADD CONSTRAINT "FamilyPlanGroup_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyPlanGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

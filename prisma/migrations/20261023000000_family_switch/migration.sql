-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'SWITCH_TO_FAMILY';

-- AlterTable
ALTER TABLE "FamilyPlanGroup" ADD COLUMN     "replacesPlanId" TEXT;

-- CreateIndex
CREATE INDEX "FamilyPlanGroup_replacesPlanId_idx" ON "FamilyPlanGroup"("replacesPlanId");

-- AddForeignKey
ALTER TABLE "FamilyPlanGroup" ADD CONSTRAINT "FamilyPlanGroup_replacesPlanId_fkey" FOREIGN KEY ("replacesPlanId") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedAt" TIMESTAMP(3);

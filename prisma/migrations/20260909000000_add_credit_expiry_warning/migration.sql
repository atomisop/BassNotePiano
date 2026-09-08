-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CREDITS_EXPIRING_SOON';

-- AlterTable
ALTER TABLE "CreditGrant" ADD COLUMN     "expiringSoonNotifiedAt" TIMESTAMP(3);

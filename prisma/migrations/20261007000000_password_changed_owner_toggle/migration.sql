-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminNotificationSetting" ADD COLUMN "ownerEnabled" BOOLEAN NOT NULL DEFAULT true;

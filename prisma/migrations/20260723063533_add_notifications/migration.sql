-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'ROLE_UPDATED', 'FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED', 'NEW_MESSAGE', 'PRACTICE_REMINDER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyEmailPayments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyEmailReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyEmailRoleUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyEmailSocial" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

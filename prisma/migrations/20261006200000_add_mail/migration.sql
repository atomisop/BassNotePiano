-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MAIL_MESSAGE';

-- CreateEnum
CREATE TYPE "MailKind" AS ENUM ('ADMIN_MESSAGE', 'PAYMENT', 'BILLING');

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MailKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "supportCta" BOOLEAN NOT NULL DEFAULT false,
    "actionLabel" TEXT,
    "actionHref" TEXT,
    "sentById" TEXT,
    "readAt" TIMESTAMP(3),
    "supportCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailMessage_userId_createdAt_idx" ON "MailMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_userId_readAt_idx" ON "MailMessage"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

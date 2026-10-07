-- CreateEnum
CREATE TYPE "SupportThreadSource" AS ENUM ('CHAT', 'EMAIL');

-- DropTable
DROP TABLE "ForwardedMail";

-- AlterTable
ALTER TABLE "AssistantEscalation" ADD COLUMN     "source" "SupportThreadSource" NOT NULL DEFAULT 'CHAT',
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "emailMessageId" TEXT;

-- CreateIndex
CREATE INDEX "AssistantEscalation_source_status_createdAt_idx" ON "AssistantEscalation"("source", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_emailMessageId_key" ON "SupportMessage"("emailMessageId");

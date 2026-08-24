-- CreateEnum
CREATE TYPE "SupportMessageSender" AS ENUM ('VISITOR', 'ATOM', 'SUPPORT');

-- AlterTable
ALTER TABLE "AssistantEscalation" ADD COLUMN "adminLastReadAt" TIMESTAMP(3);
ALTER TABLE "AssistantEscalation" DROP COLUMN "transcript";

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "sender" "SupportMessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "identifier" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMessage_escalationId_createdAt_idx" ON "SupportMessage"("escalationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "AssistantEscalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_TRANSFER';

-- AlterEnum
ALTER TYPE "SupportMessageSender" ADD VALUE 'INTERNAL';

-- AlterTable
ALTER TABLE "AssistantEscalation" ADD COLUMN     "assignedToId" TEXT;

-- CreateIndex
CREATE INDEX "AssistantEscalation_assignedToId_idx" ON "AssistantEscalation"("assignedToId");

-- AddForeignKey
ALTER TABLE "AssistantEscalation" ADD CONSTRAINT "AssistantEscalation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

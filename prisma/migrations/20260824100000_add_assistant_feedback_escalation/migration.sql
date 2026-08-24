-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ASSISTANT_ESCALATION';

-- CreateEnum
CREATE TYPE "AssistantFeedbackRating" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "AssistantEscalationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "AssistantFeedback" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "userId" TEXT,
    "rating" "AssistantFeedbackRating" NOT NULL,
    "messageContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantEscalation" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "userId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "transcript" JSONB NOT NULL,
    "status" "AssistantEscalationStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantFeedback_identifier_createdAt_idx" ON "AssistantFeedback"("identifier", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantFeedback_userId_idx" ON "AssistantFeedback"("userId");

-- CreateIndex
CREATE INDEX "AssistantEscalation_status_createdAt_idx" ON "AssistantEscalation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantEscalation_identifier_createdAt_idx" ON "AssistantEscalation"("identifier", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantFeedback" ADD CONSTRAINT "AssistantFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantEscalation" ADD CONSTRAINT "AssistantEscalation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantEscalation" ADD CONSTRAINT "AssistantEscalation_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

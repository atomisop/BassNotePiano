-- CreateTable
CREATE TABLE "SupportTypingStatus" (
    "escalationId" TEXT NOT NULL,
    "side" "SupportMessageSender" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTypingStatus_pkey" PRIMARY KEY ("escalationId","side")
);

-- AddForeignKey
ALTER TABLE "SupportTypingStatus" ADD CONSTRAINT "SupportTypingStatus_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "AssistantEscalation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

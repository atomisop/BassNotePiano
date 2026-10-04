-- CreateTable
CREATE TABLE "GroupTypingStatus" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupTypingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTypingStatus_conversationId_updatedAt_idx" ON "GroupTypingStatus"("conversationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupTypingStatus_conversationId_userId_key" ON "GroupTypingStatus"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "GroupTypingStatus" ADD CONSTRAINT "GroupTypingStatus_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "GroupConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTypingStatus" ADD CONSTRAINT "GroupTypingStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

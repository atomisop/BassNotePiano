-- CreateTable
CREATE TABLE "PinnedConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "pinOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypingStatus" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PinnedConversation_userId_pinOrder_idx" ON "PinnedConversation"("userId", "pinOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedConversation_userId_friendId_key" ON "PinnedConversation"("userId", "friendId");

-- CreateIndex
CREATE INDEX "TypingStatus_recipientId_updatedAt_idx" ON "TypingStatus"("recipientId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TypingStatus_senderId_recipientId_key" ON "TypingStatus"("senderId", "recipientId");

-- AddForeignKey
ALTER TABLE "PinnedConversation" ADD CONSTRAINT "PinnedConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedConversation" ADD CONSTRAINT "PinnedConversation_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypingStatus" ADD CONSTRAINT "TypingStatus_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypingStatus" ADD CONSTRAINT "TypingStatus_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


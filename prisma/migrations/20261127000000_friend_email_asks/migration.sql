-- "Ask to book together" by email: every ask is remembered the same way whether or not the address has an account (social.ts).
-- CreateTable
CREATE TABLE "FriendEmailAsk" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendEmailAsk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendEmailAsk_requestId_key" ON "FriendEmailAsk"("requestId");

-- CreateIndex
CREATE INDEX "FriendEmailAsk_email_idx" ON "FriendEmailAsk"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FriendEmailAsk_senderId_email_key" ON "FriendEmailAsk"("senderId", "email");

-- AddForeignKey
ALTER TABLE "FriendEmailAsk" ADD CONSTRAINT "FriendEmailAsk_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

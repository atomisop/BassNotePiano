-- CreateTable
CREATE TABLE "PianoPracticeAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PianoPracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PianoPracticeAttempt_userId_clientKey_key" ON "PianoPracticeAttempt"("userId", "clientKey");

-- CreateIndex
CREATE INDEX "PianoPracticeAttempt_userId_exerciseId_createdAt_idx" ON "PianoPracticeAttempt"("userId", "exerciseId", "createdAt");

-- AddForeignKey
ALTER TABLE "PianoPracticeAttempt" ADD CONSTRAINT "PianoPracticeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

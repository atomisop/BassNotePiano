-- CreateTable
CREATE TABLE "FamilyBundleCheckAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyBundleCheckAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyBundleCheckAttempt_userId_createdAt_idx" ON "FamilyBundleCheckAttempt"("userId", "createdAt");

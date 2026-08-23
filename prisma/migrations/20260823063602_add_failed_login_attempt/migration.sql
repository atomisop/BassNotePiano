-- CreateTable
CREATE TABLE "FailedLoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_email_createdAt_idx" ON "FailedLoginAttempt"("email", "createdAt");

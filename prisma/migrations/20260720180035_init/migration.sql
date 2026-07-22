-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('PRO_LIFETIME', 'SCALE_UNLOCK');

-- CreateEnum
CREATE TYPE "ZellePaymentStatus" AS ENUM ('AWAITING_TRANSFER', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuizResult" AS ENUM ('PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "isProMember" BOOLEAN NOT NULL DEFAULT false,
    "proUnlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ScaleGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kinitName" TEXT,
    "formula" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 2500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scaleGroupId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'LOCKED',
    "moduleRead" BOOLEAN NOT NULL DEFAULT false,
    "moduleReadAt" TIMESTAMP(3),
    "practiceCompleted" BOOLEAN NOT NULL DEFAULT false,
    "practiceCompletedAt" TIMESTAMP(3),
    "quizPassed" BOOLEAN NOT NULL DEFAULT false,
    "quizScore" INTEGER,
    "quizPassedAt" TIMESTAMP(3),
    "unlockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scaleGroupId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "result" "QuizResult" NOT NULL,
    "answers" JSONB NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZellePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "scaleGroupId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "zelleHandle" TEXT NOT NULL,
    "senderName" TEXT,
    "referenceCode" TEXT,
    "note" TEXT,
    "screenshotUrl" TEXT,
    "status" "ZellePaymentStatus" NOT NULL DEFAULT 'AWAITING_TRANSFER',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZellePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleGroup_slug_key" ON "ScaleGroup"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleGroup_order_key" ON "ScaleGroup"("order");

-- CreateIndex
CREATE INDEX "ScaleProgress_userId_status_idx" ON "ScaleProgress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleProgress_userId_scaleGroupId_key" ON "ScaleProgress"("userId", "scaleGroupId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_scaleGroupId_idx" ON "QuizAttempt"("userId", "scaleGroupId");

-- CreateIndex
CREATE INDEX "ZellePayment_status_idx" ON "ZellePayment"("status");

-- CreateIndex
CREATE INDEX "ZellePayment_userId_idx" ON "ZellePayment"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleProgress" ADD CONSTRAINT "ScaleProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleProgress" ADD CONSTRAINT "ScaleProgress_scaleGroupId_fkey" FOREIGN KEY ("scaleGroupId") REFERENCES "ScaleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_scaleGroupId_fkey" FOREIGN KEY ("scaleGroupId") REFERENCES "ScaleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_scaleGroupId_fkey" FOREIGN KEY ("scaleGroupId") REFERENCES "ScaleGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZellePayment" ADD CONSTRAINT "ZellePayment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

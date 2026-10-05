-- CreateTable
CREATE TABLE "ProcessedPaymentEmail" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "senderName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedPaymentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedPaymentEmail_messageId_key" ON "ProcessedPaymentEmail"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedPaymentEmail_amountCents_createdAt_idx" ON "ProcessedPaymentEmail"("amountCents", "createdAt");

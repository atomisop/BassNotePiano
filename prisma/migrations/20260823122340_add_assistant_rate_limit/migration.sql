-- CreateTable
CREATE TABLE "AssistantRateLimit" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantRateLimit_identifier_createdAt_idx" ON "AssistantRateLimit"("identifier", "createdAt");

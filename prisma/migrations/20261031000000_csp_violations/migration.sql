-- CreateTable
CREATE TABLE "CspViolation" (
    "id" TEXT NOT NULL,
    "directive" TEXT NOT NULL,
    "blocked" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CspViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CspViolation_lastSeenAt_idx" ON "CspViolation"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "CspViolation_directive_blocked_page_key" ON "CspViolation"("directive", "blocked", "page");

-- The phone migration was first applied to the live database before these columns were
-- added to it, and Prisma never re-runs an applied migration. Add what is missing,
-- skipping anything that already exists, so it is safe on every database.

-- AlterTable
ALTER TABLE "ProcessedPaymentEmail" ADD COLUMN IF NOT EXISTS "senderPhone" TEXT,
ADD COLUMN IF NOT EXISTS "senderPhoneLast4" TEXT;

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN IF NOT EXISTS "matchedVia" TEXT,
ADD COLUMN IF NOT EXISTS "senderPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

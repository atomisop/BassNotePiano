-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ZELLE', 'VENMO');

-- AlterTable
ALTER TABLE "ZellePayment" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'ZELLE';

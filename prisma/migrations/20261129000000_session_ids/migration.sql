-- AlterTable
ALTER TABLE "User" ADD COLUMN     "revokedSessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "KnownDevice" ADD COLUMN     "sessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

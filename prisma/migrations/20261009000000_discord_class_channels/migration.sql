-- AlterTable
ALTER TABLE "User" ADD COLUMN "discordId" TEXT,
ADD COLUMN "discordUsername" TEXT;

-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN "discordChannelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

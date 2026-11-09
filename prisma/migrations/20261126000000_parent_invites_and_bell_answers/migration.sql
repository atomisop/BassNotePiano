-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PARENT_CLASS_ASK';
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_INVITE';

-- AlterTable
ALTER TABLE "FamilyInvite" ADD COLUMN     "term" "PaymentPlanTerm";

-- CreateTable
CREATE TABLE "ParentLinkInvite" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLinkInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentLinkInvite_email_idx" ON "ParentLinkInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLinkInvite_parentId_email_key" ON "ParentLinkInvite"("parentId", "email");

-- AddForeignKey
ALTER TABLE "ParentLinkInvite" ADD CONSTRAINT "ParentLinkInvite_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

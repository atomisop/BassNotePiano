-- AlterEnum
ALTER TYPE "FriendRequestStatus" ADD VALUE 'PARENT_REVIEW';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_PARENT_REVIEW';

-- CreateTable
CREATE TABLE "FriendParentApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "parentId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendParentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendParentApproval_requestId_childId_key" ON "FriendParentApproval"("requestId", "childId");

-- CreateIndex
CREATE INDEX "FriendParentApproval_childId_approvedAt_idx" ON "FriendParentApproval"("childId", "approvedAt");

-- AddForeignKey
ALTER TABLE "FriendParentApproval" ADD CONSTRAINT "FriendParentApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FriendRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendParentApproval" ADD CONSTRAINT "FriendParentApproval_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

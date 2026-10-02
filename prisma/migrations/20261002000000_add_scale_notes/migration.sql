-- CreateTable
CREATE TABLE "ScaleNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scaleGroupId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScaleNote_userId_scaleGroupId_key" ON "ScaleNote"("userId", "scaleGroupId");

-- AddForeignKey
ALTER TABLE "ScaleNote" ADD CONSTRAINT "ScaleNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleNote" ADD CONSTRAINT "ScaleNote_scaleGroupId_fkey" FOREIGN KEY ("scaleGroupId") REFERENCES "ScaleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

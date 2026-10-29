-- AlterTable
ALTER TABLE "ScaleGroup" ADD COLUMN     "roadmapId" TEXT;

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instrument" TEXT,
    "level" TEXT,
    "artwork" TEXT NOT NULL DEFAULT 'dusk',
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_slug_key" ON "Roadmap"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_order_key" ON "Roadmap"("order");

-- CreateIndex
CREATE INDEX "ScaleGroup_roadmapId_idx" ON "ScaleGroup"("roadmapId");

-- AddForeignKey
ALTER TABLE "ScaleGroup" ADD CONSTRAINT "ScaleGroup_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The first roadmap holds every scale that exists today.
INSERT INTO "Roadmap" ("id", "slug", "name", "description", "artwork", "order", "visible", "createdAt", "updatedAt")
VALUES ('roadmap-scales', 'scales', 'Scales', 'Major, minor and the Ethiopian kinit, one scale at a time.', 'dusk', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "ScaleGroup" SET "roadmapId" = 'roadmap-scales';

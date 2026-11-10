-- Seats per slot: how many students can share each hour-long slot of a weekly window. 1 keeps today's behavior.
-- AlterTable
ALTER TABLE "ClassSchedule" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;

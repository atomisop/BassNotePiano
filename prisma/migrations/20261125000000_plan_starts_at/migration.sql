-- The first class of a plan the owner set up to start on a later day (planSetup.ts). Null on every existing plan, so nothing changes for them.
-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "startsAt" TIMESTAMP(3);

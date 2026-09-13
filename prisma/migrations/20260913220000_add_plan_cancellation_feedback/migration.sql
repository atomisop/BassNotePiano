-- CreateEnum
CREATE TYPE "PlanCancellationReason" AS ENUM ('TOO_EXPENSIVE', 'NOT_ENOUGH_TIME', 'SCHEDULE_CONFLICT', 'TAKING_A_BREAK', 'SWITCHING_TEACHER', 'NOT_SATISFIED', 'GOALS_ACHIEVED', 'TECHNICAL_ISSUES', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_CANCELLATION_FEEDBACK';

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "cancellationReason" "PlanCancellationReason",
ADD COLUMN     "cancellationReasonNote" TEXT;

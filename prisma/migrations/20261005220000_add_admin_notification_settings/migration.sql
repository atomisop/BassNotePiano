-- CreateTable
CREATE TABLE "AdminNotificationSetting" (
    "kind" TEXT NOT NULL,
    "employeesEnabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNotificationSetting_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "ForwardedMail" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardedMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardedMail_messageId_key" ON "ForwardedMail"("messageId");

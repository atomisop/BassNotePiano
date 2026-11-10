import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * "Download my data": everything the signed-in person has in their own account, as one JSON file.
 * Only their own rows, chosen by the session and never by anything in the request. Teacher notes are
 * limited to the ones the teacher left visible, the same as what the student sees on their dashboard;
 * private notes are not theirs to export.
 */
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return new NextResponse("Not signed in", { status: 401 });
  const userId = session.user.id;

  const [account, bookings, payments, plans, quizAttempts, lessonProgress, badges, notes, supportThreads, atomChats, practiceDays, notifications, friendRequestRows, bookTogetherAsks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true, email: true, username: true, createdAt: true, emailVerified: true, phone: true, phoneVerifiedAt: true,
        discordUsername: true, classCredits: true, currentStreak: true,
        notifyEmailPayments: true, notifyEmailRoleUpdates: true, notifyEmailSocial: true, notifyEmailReminders: true,
      },
    }),
    prisma.classBooking.findMany({ where: { studentId: userId }, select: { scheduledAt: true, status: true, attendance: true, creditsSpent: true, createdAt: true }, orderBy: { scheduledAt: "desc" } }),
    prisma.zellePayment.findMany({ where: { userId }, select: { purpose: true, amountCents: true, method: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.paymentPlan.findMany({ where: { userId }, select: { cadence: true, term: true, status: true, installmentsPaid: true, termMonths: true, installmentAmountCents: true } }),
    prisma.quizAttempt.findMany({ where: { userId }, select: { score: true, totalQuestions: true, result: true, attemptedAt: true }, orderBy: { attemptedAt: "desc" } }),
    prisma.lessonProgress.findMany({ where: { userId }, select: { lessonId: true, completedAt: true } }),
    prisma.userBadge.findMany({ where: { userId }, select: { code: true, earnedAt: true } }),
    prisma.studentNote.findMany({ where: { studentId: userId, hiddenFromStudent: false }, select: { body: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" } }),
    // Support conversations (the team's private notes are not theirs to export), Atom chats, practice, notices and friends.
    prisma.assistantEscalation.findMany({
      where: { userId },
      select: { subject: true, source: true, status: true, createdAt: true, messages: { where: { sender: { not: "INTERNAL" } }, select: { sender: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.assistantConversationMessage.findMany({ where: { userId }, select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.fingerPracticeDay.findMany({ where: { userId }, select: { day: true, seconds: true, completedAt: true }, orderBy: { day: "desc" } }),
    prisma.notification.findMany({ where: { userId }, select: { type: true, title: true, body: true, readAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.friendRequest.findMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] }, select: { id: true, status: true, createdAt: true, sender: { select: { username: true } }, receiver: { select: { username: true } } } }),
    prisma.friendEmailAsk.findMany({ where: { senderId: userId }, select: { email: true, createdAt: true, requestId: true }, orderBy: { createdAt: "desc" } }),
  ]);
  // A request that an "ask to book together" by email made is theirs only as the email they typed, until the other person accepts it
  // (the same as the Friends page), so the export never says whose account an email belongs to.
  const askMade = new Set(bookTogetherAsks.map((a) => a.requestId).filter((id): id is string => Boolean(id)));
  const friendRequests = friendRequestRows.filter((r) => !askMade.has(r.id) || r.status === "ACCEPTED").map(({ id: _id, ...rest }) => rest);

  const file = { exportedAt: new Date().toISOString(), account, classBookings: bookings, payments, paymentPlans: plans, quizAttempts, lessonProgress, badges, notesFromYourTeacher: notes, supportConversations: supportThreads, atomChats, practiceDays, notifications, friends: friendRequests, askedToBookTogether: bookTogetherAsks.map(({ email, createdAt }) => ({ email, createdAt })) };
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bass-note-piano-my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}

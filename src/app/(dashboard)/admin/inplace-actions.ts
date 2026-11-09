"use server";

// Server actions behind the "finish it where you are" tools: the Today screen's row menus, the Overview's Needs you rows that open in
// place, and the support thread's account panel. Each one only reads or calls an existing action's rules; the checks here are the real
// boundary (the admin layout's redirect only guards rendering).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { withStudentNotice } from "@/lib/notifyScope";
import { runOnce } from "@/lib/idempotency";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { approveNextScale, getNextApproval, ScaleApprovalError } from "@/lib/scaleApproval";
import { getNeedsYouItems } from "@/lib/needsYouItems";
import { isNeedsYouKind, type NeedsYouItem } from "@/lib/needsYou";
import { findNextOpenThread, getSupportAccountExtras, type SupportAccountExtras } from "@/lib/supportAccount";
import { sendMessageAction, type SendSummary } from "./messages/actions";
import { personPeekAction, type PersonPeek } from "./person-peek-actions";

async function requireAdmin() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session.user;
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

export type ReleaseScaleResult = { ok: true; message: string } | { ok: false; error: string; canForce: boolean };

/**
 * Releases a student's next scale from wherever the teacher is (a class row, a support chat, Needs you). The same rules as Accounts'
 * "Needs approval": without `force` a scale that is not ready yet is refused, and the answer says whether "Release anyway" can go past
 * it (the previous scale unfinished, or the one-a-week pace; never a missing plan). Sends the student the usual "A new scale is
 * unlocked" notice when `notify` is on. A double tap with the same key releases one scale, not two.
 */
export async function releaseNextScaleAction(userId: string, force: boolean, notify = true, key?: string): Promise<ReleaseScaleResult> {
  return withStudentNotice(Boolean(notify), async () => {
    const admin = await requireAdmin();
    if (!isId(userId)) return { ok: false, error: "That account was not found.", canForce: false };
    return runOnce<ReleaseScaleResult>(
      admin.id,
      "scale.release",
      key,
      async () => {
        try {
          const slug = await approveNextScale(userId, { force: Boolean(force) });
          const scale = await prisma.scaleGroup.findUnique({ where: { slug }, select: { code: true, title: true } });
          await logAudit({
            actorId: admin.id,
            actorEmail: admin.email,
            action: "scale.release",
            targetType: "User",
            targetId: userId,
            detail: `${scale?.code ?? slug}${force ? ", past the usual rules" : ""}`,
          });
          revalidatePath("/", "layout");
          return { ok: true, message: scale ? `${scale.code} released` : "Next scale released" };
        } catch (err) {
          if (!(err instanceof ScaleApprovalError)) throw err;
          const next = await getNextApproval(userId).catch(() => null);
          const ruleOnly = next?.state === "NEEDS_CHECKLIST" || next?.state === "WAITING_PACE";
          return { ok: false, error: err.message, canForce: !force && ruleOnly && !/active plan/i.test(err.message) };
        }
      },
      { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already releasing it.", canForce: false } },
    );
  });
}

/** "Message this class": one message to every student in a class, the same message Inbox > Messages sends. Once per key. */
export async function messageClassAction(
  userIds: string[],
  title: string,
  body: string,
  sendEmail: boolean,
  key?: string,
): Promise<{ ok: true; summary: SendSummary } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const ids = Array.isArray(userIds) ? userIds.filter(isId).slice(0, 50) : [];
  if (ids.length === 0) return { ok: false, error: "Nobody to write to." };
  return runOnce<{ ok: true; summary: SendSummary } | { ok: false; error: string }>(
    admin.id,
    "class.message",
    key,
    () => sendMessageAction(ids, String(title ?? ""), String(body ?? ""), Boolean(sendEmail), false),
    { isSuccess: (r) => r.ok, whileRunning: { ok: false, error: "Already sending." } },
  );
}

/** The first few things behind one Needs you row, with their main action. */
export async function needsYouItemsAction(kind: string): Promise<{ items: NeedsYouItem[]; isOwner: boolean }> {
  const admin = await requireAdmin();
  const isOwner = isOwnerEmail(admin.email);
  if (!isNeedsYouKind(kind)) return { items: [], isOwner };
  return { items: await getNeedsYouItems(kind, { isOwner }), isOwner };
}

export interface SupportAccountPanel extends SupportAccountExtras {
  person: PersonPeek;
  /** Approving a payment is the owner's (it gives value away); anyone may reject one. */
  isOwner: boolean;
}

/** The support thread's side panel: the account's facts (the same ones as the Accounts side panel), bills, next classes and next scale. */
export async function supportAccountPanelAction(userId: string): Promise<SupportAccountPanel | null> {
  const admin = await requireAdmin();
  if (!isId(userId)) return null;
  const [person, extras] = await Promise.all([personPeekAction(userId), getSupportAccountExtras(userId)]);
  if (!person) return null;
  return { person, ...extras, isOwner: isOwnerEmail(admin.email) };
}

/** After a reply or Mark resolved: the open chat waiting longest in the same inbox, if any. */
export async function nextOpenSupportThreadAction(currentId: string): Promise<{ id: string; name: string } | null> {
  await requireAdmin();
  if (!isId(currentId)) return null;
  return findNextOpenThread(currentId);
}

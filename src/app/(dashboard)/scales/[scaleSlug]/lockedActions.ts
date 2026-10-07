"use server";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, RateLimitError } from "@/lib/rateLimit";
import { AssistantEscalationError, openSubjectSupportCase } from "@/lib/support";

/** "Ask my teacher to unlock it": opens a support case with the subject Scale unlock. */
export async function askForScaleUnlockAction(scaleSlug: string): Promise<{ ok: true; escalationId: string } | { ok: false; error: string }> {
  const session = await getServerAuthSession();
  if (!session?.user) return { ok: false, error: "Sign in again." };
  try {
    const scale = await prisma.scaleGroup.findUnique({ where: { slug: scaleSlug }, select: { code: true, title: true } });
    if (!scale) return { ok: false, error: "That scale doesn't exist." };
    await assertRateLimit(
      prisma.assistantEscalation.count,
      { identifier: `user:${session.user.id}` },
      { windowMinutes: 60, max: 5, message: "You've already reached out. The team will follow up soon." },
    );
    const label = `${scale.code}: ${scale.title}`;
    const { escalationId } = await openSubjectSupportCase(session.user.id, {
      subject: "Scale unlock",
      contextLine: label,
      request: `I've finished what comes before ${label}. Could you release it for me?`,
      noticeTitle: (name) => `${name} is ready for their next scale`,
      noticeBody: `${label}.`,
    });
    return { ok: true, escalationId };
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof AssistantEscalationError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// Thumbs up/down on a single Atom reply — the small, low-attention rating
// shown under each assistant bubble in the widget (see AssistantWidget.tsx).
// Deliberately its own tiny module rather than folded into assistant.ts:
// this never talks to the model, it's a pure write-and-forget signal for
// the studio to spot which answers are missing the mark.

import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rateLimit";

export type FeedbackRating = "UP" | "DOWN";

const MAX_MESSAGE_LENGTH = 4000; // generous — MAX_OUTPUT_TOKENS (800) in assistant.ts caps real replies well under this
const FEEDBACK_LIMIT = { windowMinutes: 30, max: 40 };

export interface SubmitAssistantFeedbackInput {
  /** Same `user:<id>` / IP convention as assertAssistantRateLimit — rate-limiting only, never displayed. */
  identifier: string;
  userId: string | null;
  rating: FeedbackRating;
  messageContent: string;
}

export async function submitAssistantFeedback(input: SubmitAssistantFeedbackInput): Promise<void> {
  await assertRateLimit(
    prisma.assistantFeedback.count,
    { identifier: input.identifier },
    { ...FEEDBACK_LIMIT, message: "That's a lot of feedback in a short time — try again in a bit." },
  );

  await prisma.assistantFeedback.create({
    data: {
      identifier: input.identifier,
      userId: input.userId,
      rating: input.rating,
      messageContent: input.messageContent.slice(0, MAX_MESSAGE_LENGTH),
    },
  });
}

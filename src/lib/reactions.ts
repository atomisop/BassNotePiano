// Split out from messages.ts/groupMessages.ts on purpose: those pull in
// Prisma, which must never end up in a "use client" bundle (the reaction
// picker needs this exact same list client-side). Same pattern as
// classCreditPricing.ts / classScheduleLabels.ts.
//
// Eight quick reactions modeled on iMessage's Tapback row (heart, thumbs up,
// thumbs down, haha, emphasis, question) plus two more faces. People can also
// react with any single emoji of their own: the server checks it really is
// one emoji (isValidReaction) instead of trusting arbitrary client text into
// the emoji column.
export const REACTION_EMOJI = ["❤️", "👍", "👎", "😂", "‼️", "❓", "😮", "😢"] as const;
type ReactionEmoji = (typeof REACTION_EMOJI)[number];

// Built with the constructor: the project targets ES5, which rejects a /u literal.
const EMOJI_PATTERN = new RegExp("^(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3)", "u");

/** True for exactly one emoji (including skin tones, flags, and joined sequences like 👩‍💻). */
export function isValidReaction(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 32) return false;
  const segments = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value));
  return segments.length === 1 && EMOJI_PATTERN.test(value);
}

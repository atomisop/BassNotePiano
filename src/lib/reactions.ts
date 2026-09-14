// Split out from messages.ts/groupMessages.ts on purpose: those pull in
// Prisma, which must never end up in a "use client" bundle (the reaction
// picker needs this exact same list client-side). Same pattern as
// classCreditPricing.ts / classScheduleLabels.ts.
//
// A fixed set, not a free-text emoji picker: matching iMessage's own
// Tapback (a small, fixed set of reactions, not "any emoji"), and it's what
// lets the server validate a reaction is real rather than trusting
// arbitrary client-submitted text into the emoji column.
export const REACTION_EMOJI = ["❤️", "👍", "👎", "😂", "😮", "😢"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

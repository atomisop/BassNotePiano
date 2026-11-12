// What a username may be, in one place that has no database in it: the setup wizard checks it before the last step, the server
// enforces it when it is saved, and the suggestions below are built from the same rules, so the three can never disagree.

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const USERNAME_FORMAT_MESSAGE = "3-20 characters: lowercase letters, numbers, and underscores only.";
export const USERNAME_UNAVAILABLE_MESSAGE = "That username isn't available. Try another.";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

/** Names that would let a student pass for the studio, the teacher or the assistant in friend lists, messages and the leaderboard. */
const RESERVED_USERNAME_PARTS = ["admin", "owner", "teacher", "support", "staff", "moderator", "official", "bassnote", "bnp", "atom", "system", "root"];

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAME_PARTS.some((part) => username.includes(part));
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Why a (normalized) username cannot be used, ignoring whether someone already has it; null when it is fine. */
export function usernameProblem(username: string): string | null {
  if (!isValidUsername(username)) return USERNAME_FORMAT_MESSAGE;
  if (isReservedUsername(username)) return USERNAME_UNAVAILABLE_MESSAGE;
  return null;
}

/** Latin letters and digits only, lowercase, accents folded ("José" becomes "jose"). A name in another script yields nothing. */
function asciiWords(text: string | null | undefined): string[] {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function pushUnique(list: string[], candidate: string) {
  const username = candidate.slice(0, 20).replace(/_+$/, "");
  if (usernameProblem(username) === null && !list.includes(username)) list.push(username);
}

/** `stem` with two digits after it ("sam" becomes "sam42"), up to `count` valid ones, for when a name is taken. */
export function numberedVariants(stem: string, random: () => number = Math.random, count = 2): string[] {
  const out: string[] = [];
  for (let tries = 0; tries < count * 3 && out.length < count; tries++) {
    pushUnique(out, `${stem.slice(0, 18)}${10 + Math.floor(random() * 90)}`);
  }
  return out;
}

/**
 * Usernames worth offering a new student, best first, built from their name (falling back to the part of their email before the @
 * when the name has no Latin letters). Every one is already valid and not reserved; whether someone else holds it is for the
 * caller to check against the database. `random` is injectable so the numbered fallbacks can be tested.
 */
export function usernameCandidates(name: string | null | undefined, email: string | null | undefined, random: () => number = Math.random, limit = 12): string[] {
  let words = asciiWords(name);
  if (words.length === 0) words = asciiWords((email ?? "").split("@")[0]);
  const out: string[] = [];
  if (words.length === 0) return out;

  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : "";
  if (last) {
    pushUnique(out, `${first}${last}`);
    pushUnique(out, `${first}_${last}`);
    pushUnique(out, `${first}${last[0]}`);
    pushUnique(out, `${first[0]}${last}`);
    pushUnique(out, `${first}_${last[0]}`);
  }
  pushUnique(out, first);

  // Numbered versions last: they are always free in practice, so a name that is taken still has a way forward.
  const stems = last ? [`${first}${last}`, first] : [first];
  for (const stem of stems) for (const candidate of numberedVariants(stem, random, 3)) pushUnique(out, candidate);
  return out.slice(0, limit);
}

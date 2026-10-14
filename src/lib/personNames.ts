// Comparing the names on bank emails with the names on accounts. Pure, so it is tested.

export function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** The same word, or a single letter that starts the other ("A" for "Alemu"), as banks and people shorten names. */
function sameToken(a: string, b: string): boolean {
  return a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));
}

/** True when every word of the shorter name appears in the longer one (so "Jordan Alemu" matches "Jordan T Alemu"). */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = nameTokens(a);
  const second = nameTokens(b);
  if (first.length < 2 || second.length < 2) return false;
  const [short, long] = first.length <= second.length ? [first, second] : [second, first];
  // At least one whole word has to match as written, so two bare initials can never match a person by themselves.
  const oneWholeWord = short.some((token) => token.length > 1 && long.includes(token));
  return oneWholeWord && short.every((token) => long.some((other) => sameToken(token, other)));
}

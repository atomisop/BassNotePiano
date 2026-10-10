// Names whose bank emails are skipped: the owner's own transfers between their accounts (SoFi writes "The $40.00 sent to you
// by <your own name>"), which are not student payments. Pure, so it is unit tested.

/** Lowercase, letters and digits only, words joined by one space, so "YISEHAK  Berhanu." equals "Yisehak Berhanu". */
export function normalizeFullName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The names in the owner's list: comma or line separated, each at least two words (a single word is too loose to trust). */
export function parseIgnoredNames(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const name = normalizeFullName(part);
    if (name.split(" ").length >= 2 && !names.includes(name)) names.push(name);
  }
  return names;
}

/** True only for the exact full name: a student who shares a first name is never skipped. */
export function isIgnoredSender(senderName: string, listText: string): boolean {
  const sender = normalizeFullName(senderName);
  return sender !== "" && parseIgnoredNames(listText).includes(sender);
}

/** The list with one more name added (kept as the owner would write it). Unchanged when it is already there or is a single word. */
export function addIgnoredName(listText: string, name: string, maxLength: number): string {
  const cleaned = name.replace(/[,;\n]/g, " ").replace(/\s+/g, " ").trim();
  if (normalizeFullName(cleaned).split(" ").length < 2 || isIgnoredSender(cleaned, listText)) return listText;
  const next = listText.trim() ? `${listText.trim().replace(/[,;\s]+$/, "")}, ${cleaned}` : cleaned;
  return next.length > maxLength ? listText : next;
}

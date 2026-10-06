/**
 * One inbox, one identity. Gmail ignores dots and everything after a plus in
 * the part before the @, so a.b+1@gmail.com and ab@gmail.com are the same
 * inbox. This returns that clean copy for Gmail only: at any other domain a
 * dot or a plus can mean a different person, so those are left alone.
 */
export function canonicalEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at === -1) return clean;
  const domain = clean.slice(at + 1);
  if (domain !== "gmail.com" && domain !== "googlemail.com") return clean;
  const local = clean.slice(0, at).split("+")[0].replace(/\./g, "");
  return `${local}@gmail.com`;
}

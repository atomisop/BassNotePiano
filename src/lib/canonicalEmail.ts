/**
 * One inbox, one identity, for the once-per-person free trial. Gmail ignores dots and everything after a plus in the part before
 * the @, so a.b+1@gmail.com and ab@gmail.com are the same inbox. Almost every other provider (Outlook, iCloud, Proton, Fastmail,
 * Yahoo and company domains) also delivers name+anything@ to name@, so a plus tag is dropped at every domain: it only ever gave
 * the same person a "new" address for a second trial. Dots are dropped for Gmail only, because at any other domain a dot can be
 * a different person.
 */
export function canonicalEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at === -1) return clean;
  const domain = clean.slice(at + 1);
  const withoutTag = clean.slice(0, at).split("+")[0];
  if (domain !== "gmail.com" && domain !== "googlemail.com") return `${withoutTag}@${domain}`;
  return `${withoutTag.replace(/\./g, "")}@gmail.com`;
}

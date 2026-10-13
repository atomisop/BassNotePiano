import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Stamps who a lesson PDF was issued to on every page: a faint diagonal line across the middle and a small footer.
 * A copy that gets passed around then points back at the account it came from.
 */
export async function watermarkPdf(bytes: Uint8Array, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // Standard fonts only draw Latin-1; anything else in a name becomes a question mark rather than an error.
  const safe = label.replace(/[^\x20-\x7e]/g, "?");
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const footer = `Licensed to ${safe}. Bass Note Piano lessons. Do not share or copy.`;
    page.drawText(footer, { x: 24, y: 14, size: 7, font, color: rgb(0.45, 0.45, 0.45), opacity: 0.9 });
    const size = Math.max(14, Math.min(26, width / (safe.length * 0.42)));
    const textWidth = font.widthOfTextAtSize(safe, size);
    const angle = 35;
    const rad = (angle * Math.PI) / 180;
    page.drawText(safe, {
      x: width / 2 - (textWidth / 2) * Math.cos(rad),
      y: height / 2 - (textWidth / 2) * Math.sin(rad),
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.16,
      rotate: degrees(angle),
    });
  }
  return doc.save();
}

import { afterEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { watermarkPdf } from "@/lib/lessonWatermark";
import { lessonFileRef, resolveLessonFile } from "@/lib/storage";

const KEYS = ["R2_BUCKET_NAME", "R2_PRIVATE_BUCKET_NAME", "R2_PUBLIC_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("lesson file addresses", () => {
  it("points at the public bucket until a private one is set", () => {
    process.env.R2_BUCKET_NAME = "pub";
    process.env.R2_PUBLIC_URL = "https://files.example.com/";
    delete process.env.R2_PRIVATE_BUCKET_NAME;
    expect(lessonFileRef("lessons/a/b.pdf")).toBe("https://files.example.com/lessons/a/b.pdf");
    expect(resolveLessonFile("https://files.example.com/lessons/a/b.pdf")).toEqual({ bucket: "pub", key: "lessons/a/b.pdf" });
  });
  it("stores private references once the private bucket is set", () => {
    process.env.R2_BUCKET_NAME = "pub";
    process.env.R2_PRIVATE_BUCKET_NAME = "priv";
    process.env.R2_PUBLIC_URL = "https://files.example.com";
    expect(lessonFileRef("lessons/a/b.pdf")).toBe("private:lessons/a/b.pdf");
    expect(resolveLessonFile("private:lessons/a/b.pdf")).toEqual({ bucket: "priv", key: "lessons/a/b.pdf" });
    expect(resolveLessonFile("https://elsewhere.example.com/x.pdf")).toBeNull();
  });
});

describe("watermarkPdf", () => {
  it("keeps every page and still opens", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([300, 400]);
    const out = await watermarkPdf(await doc.save(), "Jordan Alemu (jordan@example.com)");
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan((await doc.save()).length);
  });
  it("does not choke on characters the font cannot draw", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await expect(watermarkPdf(await doc.save(), "ሰላም (a@b.co)")).resolves.toBeTruthy();
  });
});

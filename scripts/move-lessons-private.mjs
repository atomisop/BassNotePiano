// Moves every lesson file from the public R2 bucket into the private one, and points each lesson at its new home.
//
//   node --env-file=.env scripts/move-lessons-private.mjs            (shows what it would do, changes nothing)
//   node --env-file=.env scripts/move-lessons-private.mjs --apply    (copies, updates the lessons)
//   node --env-file=.env scripts/move-lessons-private.mjs --apply --delete-old   (also removes the public copies)
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (public), R2_PRIVATE_BUCKET_NAME,
// R2_PUBLIC_URL and DATABASE_URL. Safe to run again: a lesson already on "private:" is skipped.
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const deleteOld = process.argv.includes("--delete-old");
for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PRIVATE_BUCKET_NAME", "R2_PUBLIC_URL", "DATABASE_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is not set.`);
}
const publicBucket = process.env.R2_BUCKET_NAME;
const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME;
if (publicBucket === privateBucket) throw new Error("R2_PRIVATE_BUCKET_NAME must be a different bucket from R2_BUCKET_NAME.");
const base = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const prisma = new PrismaClient();

const lessons = await prisma.lesson.findMany({ select: { id: true, title: true, fileUrl: true }, orderBy: { createdAt: "asc" } });
let moved = 0;
for (const lesson of lessons) {
  if (lesson.fileUrl.startsWith("private:")) continue;
  if (!lesson.fileUrl.startsWith(`${base}/`)) {
    console.log(`SKIP  ${lesson.title}: address is not in the public bucket (${lesson.fileUrl.slice(0, 60)})`);
    continue;
  }
  const key = lesson.fileUrl.slice(base.length + 1);
  console.log(`${apply ? "MOVE" : "WOULD MOVE"}  ${lesson.title}  (${key})`);
  if (!apply) continue;
  const source = await s3.send(new GetObjectCommand({ Bucket: publicBucket, Key: key }));
  const body = Buffer.from(await source.Body.transformToByteArray());
  await s3.send(new PutObjectCommand({ Bucket: privateBucket, Key: key, Body: body, ContentType: source.ContentType, CacheControl: "private, no-store" }));
  const check = await s3.send(new HeadObjectCommand({ Bucket: privateBucket, Key: key }));
  if (check.ContentLength !== body.length) throw new Error(`Copy of ${key} did not match in size; stopping before changing anything else.`);
  await prisma.lesson.update({ where: { id: lesson.id }, data: { fileUrl: `private:${key}` } });
  if (deleteOld) await s3.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: key }));
  moved++;
}
console.log(apply ? `Done. ${moved} lesson file(s) moved${deleteOld ? " and removed from the public bucket" : ""}.` : "Nothing changed. Add --apply to do it.");
await prisma.$disconnect();

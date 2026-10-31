// Uploads the pictures behind the scale cards to the public R2 bucket, as scale-art/<scale slug>.jpg (ScaleArt reads them there).
//
//   node --env-file=.env scripts/upload-scale-art.mjs <folder of <slug>.jpg files>
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (public) and R2_PUBLIC_URL. A picture with the same name
// is replaced; browsers keep a copy for up to a day, so a replaced picture shows within a day.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const folder = process.argv[2];
if (!folder) throw new Error("Give the folder of pictures: node --env-file=.env scripts/upload-scale-art.mjs <folder>");
for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is not set.`);
}
const base = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const files = readdirSync(folder).filter((f) => /^[a-z0-9-]+\.jpg$/.test(f));
if (files.length === 0) throw new Error("No <slug>.jpg files in that folder.");
for (const file of files) {
  const key = `scale-art/${file}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: readFileSync(join(folder, file)),
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=86400",
    }),
  );
  console.log(`${base}/${key}`);
}

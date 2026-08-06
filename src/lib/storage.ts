// Object storage for admin-uploaded course content (video/PDF lessons).
//
// Why not route uploads through a Netlify serverless function: those cap
// request bodies at a few MB, so any in-app upload endpoint hits that
// ceiling regardless of what this app's own code allows. The fix is a
// direct-to-storage upload — the server only ever issues a short-lived
// presigned PUT URL; the admin's browser uploads the file straight to
// object storage, bypassing the app server (and its body-size limit)
// entirely. Only the resulting file URL + metadata ever touches Postgres.
//
// Cloudflare R2 is the default target — S3-compatible (so the standard AWS
// SDK v3 packages work unmodified against it), no egress fees, a per-object
// limit in the terabytes. Any other S3-compatible provider works too; only
// the env vars below would need to change.
//
// Required setup (one-time, in the Cloudflare dashboard — see
// .env.example for exactly which values map to which env var):
//   1. Create an R2 bucket.
//   2. Create an R2 API token scoped to that bucket (gives you the access
//      key ID + secret access key).
//   3. Enable public access on the bucket (either the free r2.dev subdomain,
//      or a custom domain) — lessons are served directly from this URL by
//      <video>/<iframe>, so it has to be reachable without a signed request.

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"] as const;

function isStorageConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]));
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Object storage isn't configured yet — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, " +
        "R2_BUCKET_NAME, and R2_PUBLIC_URL (see .env.example) before uploading lessons.",
    );
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/** Cheap, callable before doing any real work — lets the admin UI show a clear "storage isn't set up" state instead of a raw upload failure. */
export function isObjectStorageConfigured(): boolean {
  return isStorageConfigured();
}

export interface PresignedUpload {
  uploadUrl: string; // PUT here directly from the browser
  key: string; // store this (or the derived public URL) on the Lesson row
  publicUrl: string; // what fileUrl should be set to once the upload succeeds
}

/**
 * Issues a short-lived (10 min) presigned PUT URL for a direct browser →
 * R2 upload. `key` is namespaced under lessons/<scaleGroupSlug>/ so files
 * are easy to find/audit in the bucket by scale.
 */
export async function createPresignedLessonUpload(
  scaleGroupSlug: string,
  fileName: string,
  contentType: string,
): Promise<PresignedUpload> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `lessons/${scaleGroupSlug}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, key, publicUrl };
}

/** Best-effort — called when an admin deletes a Lesson row, so the bucket doesn't accumulate orphaned files. Failure here shouldn't block the DB delete. */
export async function deleteLessonFile(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error(`Failed to delete R2 object "${key}" (non-blocking):`, err);
  }
}

/** Derives the storage key back out of a stored public URL, for deletion. */
export function keyFromPublicUrl(publicUrl: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base || !publicUrl.startsWith(`${base}/`)) return null;
  return publicUrl.slice(base.length + 1);
}

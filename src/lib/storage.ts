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

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------
//
// Both presign functions below used to accept `contentType` from the caller
// with no server-side check at all — the admin lesson form and the avatar
// form each validated it client-side before calling in, but a Server Action
// is a real callable RPC endpoint, not gated by whichever UI happens to call
// it normally. Anyone with a valid session could call
// `requestLessonUploadUrlAction`/`requestAvatarUploadUrlAction` directly with
// an arbitrary content type or a fabricated size and get a legitimately
// signed URL for it. Flagged in the Step 4 security audit; fixed here.
//
// The size limit is enforced two ways, not one:
//   1. Rejected here, before a URL is ever minted, against MAX_*_BYTES.
//   2. Signed into the presigned URL itself via `ContentLength`. S3-compatible
//      signing (R2 included) covers ContentLength when it's passed to
//      PutObjectCommand, so the actual PUT the browser performs must match
//      the declared size exactly or R2 rejects it — a caller can't request a
//      URL for a small file and then stream something larger through it.
//      This is why both call sites now pass the size of what is ACTUALLY
//      uploaded (the resized avatar blob, not the original source file) —
//      signing the wrong number would just break real uploads.

const MB = 1024 * 1024;

const LESSON_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/pdf",
]);
/** Generous on purpose — real lesson videos are long, high-quality files. */
const MAX_LESSON_VIDEO_BYTES = 3 * 1024 * MB; // 3 GB
const MAX_LESSON_PDF_BYTES = 100 * MB;

const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Well above what a resized profile photo needs — this is the server-side
 *  backstop behind the client's own resize step, not the primary size logic. */
const MAX_AVATAR_BYTES = 8 * MB;

function assertValidUpload(
  contentType: string,
  fileSize: number,
  allowedTypes: Set<string>,
  maxBytes: number,
  label: string,
) {
  if (!allowedTypes.has(contentType)) {
    throw new Error(`Unsupported ${label} type: "${contentType}".`);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error(`Missing or invalid file size for this ${label} upload.`);
  }
  if (fileSize > maxBytes) {
    throw new Error(`That ${label} is too large — max ${Math.round(maxBytes / MB)} MB.`);
  }
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
  fileSize: number,
): Promise<PresignedUpload> {
  const maxBytes = contentType === "application/pdf" ? MAX_LESSON_PDF_BYTES : MAX_LESSON_VIDEO_BYTES;
  assertValidUpload(contentType, fileSize, LESSON_CONTENT_TYPES, maxBytes, "lesson file");

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `lessons/${scaleGroupSlug}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    // STEP 22: no CacheControl was set at all before this — every request
    // for a lesson video/PDF, including repeat views by the same student,
    // hit R2 directly rather than the CDN edge cache in front of it. Safe
    // to cache forever because the key already encodes a timestamp
    // (Date.now() above) — the object at this exact key never changes
    // content, a re-upload gets a brand new key instead of overwriting.
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, key, publicUrl };
}

/** Namespaced under avatars/<userId>/ so a user's old versions are easy to find/audit, and so one user's uploads can never collide with another's key. */
export async function createPresignedAvatarUpload(
  userId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<PresignedUpload> {
  assertValidUpload(contentType, fileSize, AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES, "avatar image");

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `avatars/${userId}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    // STEP 22: same reasoning as the lesson upload above — the key is
    // timestamped, so it's immutable; a new avatar gets a new key rather
    // than overwriting this one, and the DB row pointing at "current
    // avatar" is what actually changes.
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, key, publicUrl };
}

/** Best-effort delete of any object by key — failure here should never block whatever DB change triggered it (a Lesson delete, an avatar replacement, etc). */
export async function deleteObject(key: string): Promise<void> {
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

// Object storage for admin-uploaded course content (video/PDF lessons).
//
// Why not route uploads through a Netlify serverless function: those cap
// request bodies at a few MB, so any in-app upload endpoint hits that
// ceiling regardless of what this app's own code allows. The fix is a
// direct-to-storage upload, the server only ever issues a short-lived
// presigned PUT URL; the admin's browser uploads the file straight to
// object storage, bypassing the app server (and its body-size limit)
// entirely. Only the resulting file URL + metadata ever touches Postgres.
//
// Cloudflare R2 is the default target, S3-compatible (so the standard AWS
// SDK v3 packages work unmodified against it), no egress fees, a per-object
// limit in the terabytes. Any other S3-compatible provider works too; only
// the env vars below would need to change.
//
// Required setup (one-time, in the Cloudflare dashboard, see
// .env.example for exactly which values map to which env var):
//   1. Create an R2 bucket.
//   2. Create an R2 API token scoped to that bucket (gives you the access
//      key ID + secret access key).
//   3. Enable public access on the bucket (either the free r2.dev subdomain,
//      or a custom domain), lessons are served directly from this URL by
//      <video>/<iframe>, so it has to be reachable without a signed request.

import { randomBytes } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL"] as const;

function isStorageConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]));
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Object storage isn't configured yet. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, " +
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
      // Recent AWS SDK versions add a CRC32 checksum to every request and to
      // presigned URLs by default. Cloudflare R2 does not accept that field
      // on a browser PUT: it answers with an error that carries no CORS
      // headers, which the browser can only report as a network failure
      // ("Upload failed, check your connection"). Only compute checksums
      // when an operation actually requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Private lesson files
// ---------------------------------------------------------------------------
//
// Lesson PDFs and videos are paid content, so they are meant to live in a bucket with NO public access
// (R2_PRIVATE_BUCKET_NAME) and are only ever handed to a signed-in student by /api/lessons/[lessonId]/file,
// which checks access and stamps the student's name on every PDF page. A lesson stored there has
// fileUrl "private:<key>". Until that bucket is set, new files keep going to the public bucket exactly as
// before, and the same route serves them (the public address still works until the owner turns it off).

const PRIVATE_REF = "private:";

/** The bucket lesson files live in: the private one when it is configured, else the public one. */
export function lessonBucketName(): string | undefined {
  return process.env.R2_PRIVATE_BUCKET_NAME || process.env.R2_BUCKET_NAME;
}

export function isPrivateBucketConfigured(): boolean {
  return Boolean(process.env.R2_PRIVATE_BUCKET_NAME);
}

/**
 * A storage key is only ever a plain path of real names. A dot segment ("..", "."), an empty segment, a backslash, a percent
 * escape or a control character could make a key mean a different object than the folder prefix it was checked against.
 */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 1024) return false;
  if (/[\\%\u0000-\u001f\u007f]/.test(key)) return false;
  return key.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Where a stored lesson fileUrl points: "private:<key>" or a public address in the public bucket. */
export function resolveLessonFile(fileUrl: string): { bucket: string; key: string } | null {
  if (fileUrl.startsWith(PRIVATE_REF)) {
    const bucket = lessonBucketName();
    const key = fileUrl.slice(PRIVATE_REF.length);
    return bucket && isSafeObjectKey(key) ? { bucket, key } : null;
  }
  const key = keyFromPublicUrl(fileUrl);
  return key && process.env.R2_BUCKET_NAME ? { bucket: process.env.R2_BUCKET_NAME, key } : null;
}

/**
 * A lesson address an admin may save: when it points into our storage it must be a safe key under lessons/ (what the upload
 * step hands out), so a lesson can never name some other object (a backup, an avatar) that deleting the lesson would remove.
 * An address that does not point into our storage is left to the caller.
 */
export function isAcceptableLessonFileRef(fileUrl: string): boolean {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  const isPrivate = fileUrl.startsWith(PRIVATE_REF);
  const isPublic = Boolean(base) && fileUrl.startsWith(`${base}/`);
  if (!isPrivate && !isPublic) return true;
  const key = isPrivate ? fileUrl.slice(PRIVATE_REF.length) : fileUrl.slice(base!.length + 1);
  return isSafeObjectKey(key) && key.startsWith("lessons/");
}

/** What a lesson row stores for a freshly uploaded key. */
export function lessonFileRef(key: string): string {
  return isPrivateBucketConfigured() ? `${PRIVATE_REF}${key}` : `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
}

/** Reads a lesson file (optionally a byte range) for the app to hand on. */
export async function getLessonObject(fileUrl: string, range?: string) {
  const where = resolveLessonFile(fileUrl);
  if (!where) return null;
  return getClient().send(new GetObjectCommand({ Bucket: where.bucket, Key: where.key, Range: range }));
}

/** Best-effort delete of a lesson's backing file, wherever it lives. */
export async function deleteLessonFile(fileUrl: string): Promise<void> {
  const where = resolveLessonFile(fileUrl);
  // Only ever objects under lessons/: a lesson row must not be able to delete anything else in the bucket.
  if (!where || !where.key.startsWith("lessons/")) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: where.bucket, Key: where.key }));
  } catch (err) {
    console.error(`Failed to delete lesson file "${where.key}" (non-blocking):`, err);
  }
}

/** Cheap, callable before doing any real work, lets the admin UI show a clear "storage isn't set up" state instead of a raw upload failure. */
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
// with no server-side check at all, the admin lesson form and the avatar
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
//      the declared size exactly or R2 rejects it, a caller can't request a
//      URL for a small file and then stream something larger through it.
//      This is why both call sites now pass the size of what is ACTUALLY
//      uploaded (the resized avatar blob, not the original source file),
//      signing the wrong number would just break real uploads.

const MB = 1024 * 1024;

const LESSON_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/pdf",
]);
/** Generous on purpose, real lesson videos are long, high-quality files. */
const MAX_LESSON_VIDEO_BYTES = 3 * 1024 * MB; // 3 GB
const MAX_LESSON_PDF_BYTES = 100 * MB;

const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Well above what a resized profile photo needs, this is the server-side
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
    throw new Error(`That ${label} is too large. Max ${Math.round(maxBytes / MB)} MB.`);
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
  // A random token in the key: the file's public address cannot be guessed from the lesson's name and the upload time.
  const key = `lessons/${scaleGroupSlug}/${randomBytes(16).toString("hex")}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: lessonBucketName(),
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    // Served only through the app to a signed-in student, never cached by a shared cache.
    CacheControl: "private, no-store",
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  const publicUrl = lessonFileRef(key);

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
    // STEP 22: same reasoning as the lesson upload above, the key is
    // timestamped, so it's immutable; a new avatar gets a new key rather
    // than overwriting this one, and the DB row pointing at "current
    // avatar" is what actually changes.
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  const publicUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;

  return { uploadUrl, key, publicUrl };
}

/** Best-effort delete of any object by key, failure here should never block whatever DB change triggered it (a Lesson delete, an avatar replacement, etc). */
export async function deleteObject(key: string): Promise<void> {
  // Only avatars and lesson files are ever deleted this way; never backups/ or anything outside those folders.
  if (!isSafeObjectKey(key) || !(key.startsWith("avatars/") || key.startsWith("lessons/"))) {
    console.error(`Refused to delete R2 object outside avatars/ and lessons/: "${key.slice(0, 80)}"`);
    return;
  }
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
  const key = publicUrl.slice(base.length + 1);
  return isSafeObjectKey(key) ? key : null;
}

// ---------------------------------------------------------------------------
// Nightly database backup (see src/lib/backupCore.ts, netlify/functions/db-backup.ts)
// ---------------------------------------------------------------------------
//
// The bucket is public, so only ENCRYPTED bytes are ever stored under backups/.
// These helpers never return a public URL for them.

/** Stores an already-encrypted backup. No cache headers, never linked from anywhere. */
export async function putBackupObject(key: string, body: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: "application/octet-stream", CacheControl: "no-store" }),
  );
}

/** The stored size of a backup, or null if it is not there. */
export async function headBackupObject(key: string): Promise<number | null> {
  try {
    const head = await getClient().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function listBackupObjects(): Promise<string[]> {
  const out = await getClient().send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: "backups/", MaxKeys: 1000 }));
  return (out.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
}

export async function deleteBackupObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
}

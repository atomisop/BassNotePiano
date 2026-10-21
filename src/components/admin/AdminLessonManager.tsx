"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { LessonMediaType } from "@prisma/client";
import type { CourseLesson } from "@/lib/courseContent";
import { Collapse } from "@/components/ui/Collapse";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";

interface PresignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

interface CreateLessonPayload {
  scaleGroupSlug: string;
  title: string;
  description?: string;
  type: LessonMediaType;
  fileUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
}

export interface AdminLessonManagerProps {
  scaleGroupSlug: string;
  scaleGroupLabel: string;
  lessons: CourseLesson[];
  storageConfigured: boolean;
  onRequestUploadUrl: (
    scaleGroupSlug: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ) => Promise<PresignedUpload>;
  onCreateLesson: (input: CreateLessonPayload) => Promise<CourseLesson>;
  onDeleteLesson: (lessonId: string, scaleGroupSlug: string) => Promise<void>;
  onReorder: (scaleGroupSlug: string, orderedLessonIds: string[]) => Promise<void>;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "n/a";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "n/a";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Reads a video file's duration client-side by loading it into a detached <video> element, best-effort, resolves null on any failure rather than blocking the upload. */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

/** PUT directly to the presigned URL with upload-progress reporting, fetch() has no upload-progress event, so this needs XHR. */
function uploadWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    // Lesson videos can be large and slow, so a total timeout would kill a
    // healthy upload. Instead, give up only when nothing has moved for a
    // while (a stalled connection), and say so.
    const STALL_MS = 45_000;
    let stallTimer: ReturnType<typeof setTimeout>;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        xhr.abort();
        reject(new Error("The upload stalled. Check your connection and try again."));
      }, STALL_MS);
    };
    xhr.upload.onprogress = (e) => {
      armStall();
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      clearTimeout(stallTimer);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => {
      clearTimeout(stallTimer);
      reject(new Error("Upload failed. Check your connection and try again."));
    };
    armStall();
    xhr.send(file);
  });
}

export function AdminLessonManager({
  scaleGroupSlug,
  scaleGroupLabel,
  lessons,
  storageConfigured,
  onRequestUploadUrl,
  onCreateLesson,
  onDeleteLesson,
  onReorder,
}: AdminLessonManagerProps) {
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setTitle("");
    setDescription("");
    setProgress(0);
    setFile(null);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Held in state by <FileDropzone> rather than read off a ref, so drag-and-
    // drop and click-to-choose land in the same place.
    if (!file) {
      setError("Choose a video or PDF file.");
      return;
    }
    if (!title.trim()) {
      setError("Give the lesson a title.");
      return;
    }
    const type: LessonMediaType | null = file.type.startsWith("video/") ? "VIDEO" : file.type === "application/pdf" ? "PDF" : null;
    if (!type) {
      setError("Only video files or PDFs are supported.");
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const durationSeconds = type === "VIDEO" ? await readVideoDuration(file) : null;
      const { uploadUrl, publicUrl } = await onRequestUploadUrl(scaleGroupSlug, file.name, file.type, file.size);
      await uploadWithProgress(uploadUrl, file, file.type, setProgress);
      await onCreateLesson({
        scaleGroupSlug,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        fileUrl: publicUrl,
        fileName: file.name,
        fileSizeBytes: file.size,
        durationSeconds: durationSeconds ?? undefined,
      });
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong uploading that file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(lessonId: string) {
    setBusy(true);
    try {
      await onDeleteLesson(lessonId, scaleGroupSlug);
      setDeletingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setBusy(true);
    try {
      await onReorder(
        scaleGroupSlug,
        reordered.map((l) => l.id),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-slate-400">
          {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={!storageConfigured}
          className={buttonVariants({ variant: "primary" })}
        >
          {showForm ? "Cancel" : "Upload a lesson"}
        </button>
      </div>

      <Collapse open={showForm}>
        <form onSubmit={handleUpload} className="glass-surface space-y-3.5 p-5">
          <div>
            <label className="mb-1 block text-small font-medium text-slate-400">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reading the Bati formula"
              disabled={uploading}
              className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-small font-medium text-slate-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={uploading}
              className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] disabled:opacity-60"
            />
          </div>
          <div>
            <p className="mb-1 block text-small font-medium text-slate-400">Video or PDF file</p>
            {/* The dropzone owns both the picker and the progress bar, so the
                separate `{uploading && …}` block below it is gone, one place
                shows what file is queued and how far along it is. */}
            <FileDropzone
              accept="video/*,application/pdf"
              file={file}
              onFileSelected={setFile}
              progress={uploading ? progress : null}
              disabled={uploading}
              hint="MP4 or PDF · drag it in, or click to browse"
            />
          </div>

          {error && <p className="text-small text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={uploading}
            className={buttonVariants({ variant: "primary", className: "flex w-full" })}
          >
            {uploading && <MorphingSquare size={14} className="mr-2 shrink-0" />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </Collapse>

      {lessons.length === 0 ? (
        <p className="glass-surface p-6 text-center text-small text-slate-500">No lessons for this scale yet.</p>
      ) : (
        <div className="glass-surface divide-y divide-slate-50/10 px-4">
          {lessons.map((lesson, index) => (
            <div key={lesson.id} className="flex items-center gap-3 py-3.5">
              <span className="w-5 shrink-0 text-center text-small font-semibold text-slate-500">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-body text-slate-50">{lesson.title}</h2>
                <p className="truncate text-small text-slate-500">
                  {lesson.type === "VIDEO" ? "Video" : "PDF"}
                  {lesson.fileSizeBytes != null && ` · ${formatBytes(lesson.fileSizeBytes)}`}
                  {lesson.type === "VIDEO" && lesson.durationSeconds != null && ` · ${formatDuration(lesson.durationSeconds)}`}
                </p>
              </div>

              {deletingId === lesson.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    disabled={busy}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(lesson.id)}
                    disabled={busy}
                    className={buttonVariants({ variant: "danger", size: "sm", className: "bg-red-500/95" })}
                  >
                    {busy && <MorphingSquare size={13} className="mr-1.5 shrink-0" />}
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => handleMove(index, -1)}
                    disabled={busy || index === 0}
                    aria-label="Move up"
                    className={buttonVariants({ variant: "secondary", size: "iconSm" })}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, 1)}
                    disabled={busy || index === lessons.length - 1}
                    aria-label="Move down"
                    className={buttonVariants({ variant: "secondary", size: "iconSm" })}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(lesson.id)}
                    aria-label={`Delete ${lesson.title}`}
                    className={buttonVariants({ variant: "secondary", size: "iconSm" })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

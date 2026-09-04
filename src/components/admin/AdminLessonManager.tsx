"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LessonMediaType } from "@prisma/client";
import type { CourseLesson } from "@/lib/courseContent";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { EmptyState } from "@/components/ui/EmptyState";
import { SpinnerIcon } from "@/components/ui/icons";

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
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Reads a video file's duration client-side by loading it into a detached <video> element — best-effort, resolves null on any failure rather than blocking the upload. */
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

/** PUT directly to the presigned URL with upload-progress reporting — fetch() has no upload-progress event, so this needs XHR. */
function uploadWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
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
        <p className="text-sm text-slate-400">{scaleGroupLabel}</p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={!storageConfigured}
          className="cta-sheen cta-fill rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showForm ? "Cancel" : "Upload a lesson"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleUpload} className="glass-surface space-y-3.5 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reading the Bati formula"
              disabled={uploading}
              className="w-full glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)] disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={uploading}
              className="w-full resize-none glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-[rgb(var(--c-a-400)/0.6)] disabled:opacity-60"
            />
          </div>
          <div>
            <p className="mb-1 block text-xs font-medium text-slate-400">Video or PDF file</p>
            {/* The dropzone owns both the picker and the progress bar, so the
                separate `{uploading && …}` block below it is gone — one place
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

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="cta-sheen cta-fill flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading && <SpinnerIcon className="mr-2" size={14} />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}

      {lessons.length === 0 ? (
        <EmptyState
          title="No lessons for this scale yet"
          description="Upload a video or PDF and it becomes the first module students work through. They unlock in the order you set here."
        />
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, index) => (
            <div key={lesson.id} className="glass-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--c-a-400)/0.3)] bg-[rgb(var(--c-a-400)/0.1)] text-xs font-semibold text-[rgb(var(--c-a-300))]">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {lesson.type}
                      </span>
                      <h3 className="font-serif text-base text-slate-50">{lesson.title}</h3>
                    </div>
                    {lesson.description && <p className="mt-1 text-sm text-slate-500">{lesson.description}</p>}
                    <p className="mt-1 text-xs text-slate-600">
                      {lesson.fileName} · {formatBytes(lesson.fileSizeBytes)}
                      {lesson.type === "VIDEO" && ` · ${formatDuration(lesson.durationSeconds)}`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMove(index, -1)}
                    disabled={busy || index === 0}
                    aria-label="Move up"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-slate-400 transition hover:border-ink/15 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(index, 1)}
                    disabled={busy || index === lessons.length - 1}
                    aria-label="Move down"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-slate-400 transition hover:border-ink/15 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-3">
                {deletingId === lesson.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-ink/10 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(lesson.id)}
                      disabled={busy}
                      className="flex-1 rounded-lg bg-red-500/95 py-2 text-sm font-semibold text-slate-950 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Confirm delete"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeletingId(lesson.id)}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-red-400/30 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

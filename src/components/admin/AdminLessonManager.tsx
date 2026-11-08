"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "framer-motion";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toaster";
import type { LessonMediaType } from "@prisma/client";
import type { CourseLesson } from "@/lib/courseContent";
import { Collapse } from "@/components/ui/Collapse";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "@/components/ui/appIcons";
import { Hint } from "@/components/ui/Hint";

const editField = "h-11 w-full rounded-control border border-(--field-edge) bg-neu-base px-4 text-body text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  onEditLesson: (lessonId: string, scaleGroupSlug: string, title: string, description: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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

/**
 * One lesson row you can drag by its number. It lifts and grows 5% under the finger with a deeper shadow while the
 * other rows slide out of its way (framer-motion's Reorder does the sliding). Only the number is the handle, so the
 * buttons on the row and page scrolling on a phone are never grabbed by accident.
 */
function DragRow({ lesson, index, onDrop, children }: { lesson: CourseLesson; index: number; onDrop: () => void; children: ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={lesson}
      as="div"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.05, zIndex: 20, boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}
      transition={{ type: "spring", bounce: 0.1, duration: 0.3 }}
      className="relative flex items-center gap-3 rounded-card bg-transparent py-3.5"
    >
      <span
        onPointerDown={(e) => controls.start(e)}
        role="img"
        aria-label={`Drag to move lesson ${index + 1}`}
        title="Drag to reorder"
        style={{ touchAction: "none" }}
        className="hit-slop flex w-5 shrink-0 cursor-grab select-none items-center justify-center self-stretch text-small font-semibold text-slate-500 active:cursor-grabbing"
      >
        {index + 1}
      </span>
      {children}
    </Reorder.Item>
  );
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
  onEditLesson,
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
  const [editing, setEditing] = useState<CourseLesson | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  // The order on screen while a row is being dragged; the server's order wins again whenever the page data changes.
  const [items, setItems] = useState(lessons);
  useEffect(() => setItems(lessons), [lessons]);

  async function handleDrop() {
    const same = items.length === lessons.length && items.every((l, i) => l.id === lessons[i]?.id);
    if (same) return;
    setBusy(true);
    try {
      await onReorder(scaleGroupSlug, items.map((l) => l.id));
      router.refresh();
    } catch {
      setItems(lessons);
      toast.warning("That did not save. The order is back as it was.");
    } finally {
      setBusy(false);
    }
  }

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
      const hold = await toast.held("Deleting the lesson", () => onDeleteLesson(lessonId, scaleGroupSlug));
      if (hold.undone) {
        setDeletingId(null);
        return;
      }
      setDeletingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(lesson: CourseLesson) {
    setEditing(lesson);
    setEditTitle(lesson.title);
    setEditDescription(lesson.description ?? "");
  }

  async function handleEdit() {
    if (!editing) return;
    setBusy(true);
    const result = await onEditLesson(editing.id, scaleGroupSlug, editTitle, editDescription).catch(() => ({ ok: false as const, error: "Could not save the lesson. Try again." }));
    setBusy(false);
    if (!result.ok) return void toast.warning(result.error);
    toast.success("Lesson saved");
    setEditing(null);
    router.refresh();
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
              className="w-full glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-small font-medium text-slate-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={uploading}
              className="w-full resize-none glass-surface-subtle px-3 py-2 text-body text-slate-100 outline-none transition focus:border-slate-50/60 disabled:opacity-60"
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
        <EmptyState icon={<FileText />} title="No lessons for this scale yet" description="Upload a PDF or video and it appears in the scale's lesson list." />
      ) : (
        <Reorder.Group as="div" axis="y" values={items} onReorder={setItems} className="glass-surface divide-y divide-slate-50/10 px-4">
          {items.map((lesson, index) => (
            <DragRow key={lesson.id} lesson={lesson} index={index} onDrop={handleDrop}>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-title text-slate-50">{lesson.title}</h2>
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
                    onClick={() => startEdit(lesson)}
                    aria-label={`Rename ${lesson.title}`}
                    className={buttonVariants({ variant: "secondary", size: "iconSm" })}
                  >
                    <Pencil className="h-4 w-4" />
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
            </DragRow>
          ))}
        </Reorder.Group>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !busy && !next && setEditing(null)} title="Rename the lesson">
        <div className="grid gap-4">
          <p className="text-small text-slate-400"><Hint>The file, its place in the list and everyone&apos;s progress stay as they are.</Hint></p>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Title</span>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} className={editField} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-small font-medium text-slate-200">Description (optional)</span>
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={1000} rows={3} className={`${editField} h-auto resize-none py-2.5`} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className={buttonVariants({ variant: "secondary" })}>
              Cancel
            </button>
            <button type="button" disabled={busy || !editTitle.trim()} onClick={() => void handleEdit()} aria-busy={busy} className={buttonVariants({ variant: "primary" })}>
              {busy && <MorphingSquare size={14} className="mr-2 shrink-0" />}
              Save
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import * as React from "react";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * #5 — Drag-and-drop upload with validation and progress.
 *
 * Backend-agnostic: it validates and reports, the caller uploads. That matters
 * here because lesson media goes to R2 through a presigned URL, so the
 * component must not assume a POST endpoint.
 *
 * A real <input type="file"> stays in the DOM (visually hidden, not
 * `display:none`) rather than being replaced by a div listening for clicks —
 * that is what keeps it keyboard-reachable and announced as a file input.
 * The drop zone is a label pointing at it, so click and drop both work
 * without duplicating logic.
 */
export function FileDropzone({
  accept,
  maxBytes,
  file,
  onFileSelected,
  progress,
  disabled,
  hint,
  className,
}: {
  /** e.g. "video/*,application/pdf" */
  accept?: string;
  maxBytes?: number;
  file: File | null;
  onFileSelected: (file: File | null) => void;
  /** 0-100 while uploading, or null when idle. */
  progress?: number | null;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  function validateAndSet(next: File | null) {
    setError(null);
    if (!next) {
      onFileSelected(null);
      return;
    }
    if (maxBytes && next.size > maxBytes) {
      setError(`That file is ${formatBytes(next.size)}. The limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (accept) {
      const patterns = accept.split(",").map((a) => a.trim());
      const ok = patterns.some((p) =>
        p.endsWith("/*") ? next.type.startsWith(p.slice(0, -1)) : next.type === p,
      );
      if (!ok) {
        setError(`${next.type || "That file type"} isn't accepted here.`);
        return;
      }
    }
    onFileSelected(next);
  }

  const uploading = typeof progress === "number";

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          validateAndSet(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition",
          dragging
            ? "border-[rgb(var(--c-s-50))] bg-[rgb(var(--c-s-50)/0.1)]"
            : "border-ink/15 hover:border-[rgb(var(--c-s-50)/0.5)] hover:bg-[rgb(var(--c-s-50))]/[0.04]",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="text-[rgb(var(--c-s-50))]"
          aria-hidden
        >
          <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
        <span className="mt-3 text-small font-medium text-slate-100">
          {dragging ? "Drop to upload" : "Drag a file here, or click to choose"}
        </span>
        {hint && <span className="mt-1 text-small text-slate-500">{hint}</span>}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
        className="sr-only"
      />

      {error && (
        <p role="alert" className="mt-2 text-small text-red-400">
          {error}
        </p>
      )}

      {file && (
        <div className="mt-3 rounded-lg border border-ink/10 bg-slate-900 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-small text-slate-100">{file.name}</p>
              <p className="mt-0.5 text-small text-slate-500">{formatBytes(file.size)}</p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => {
                  onFileSelected(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="shrink-0 cursor-pointer text-small text-slate-500 transition hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>

          {uploading && (
            <div className="mt-3">
              <ProgressBar value={progress!} label={`Uploading ${file.name}`} />
              <p className="mt-1.5 text-small tabular-nums text-slate-500">
                {Math.round(progress!)}% uploaded
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

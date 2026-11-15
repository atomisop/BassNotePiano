"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import * as React from "react";
import { cn } from "@/lib/utils";
import { UploadSimple } from "@/components/ui/appIcons";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * #5, Drag-and-drop upload with validation and progress.
 *
 * Backend-agnostic: it validates and reports, the caller uploads. That matters
 * here because lesson media goes to R2 through a presigned URL, so the
 * component must not assume a POST endpoint.
 *
 * A real <input type="file"> stays in the DOM (visually hidden, not
 * `display:none`) rather than being replaced by a div listening for clicks,
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

  // Time left, from how fast the percent has actually been moving. Nothing is
  // shown until there is a little data (>=3% and >=1s) so the first estimate
  // isn't wild.
  const startedAt = React.useRef<number | null>(null);
  const [etaSeconds, setEtaSeconds] = React.useState<number | undefined>(undefined);
  React.useEffect(() => {
    if (typeof progress !== "number") {
      startedAt.current = null;
      setEtaSeconds(undefined);
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const elapsed = (Date.now() - startedAt.current) / 1000;
    if (progress >= 3 && elapsed >= 1 && progress < 100) {
      setEtaSeconds((elapsed * (100 - progress)) / progress);
    }
  }, [progress]);

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
            ? "border-slate-50 bg-slate-50/10"
            : "border-ink/15 hover:border-slate-50/50 hover:bg-slate-50/[0.04]",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <UploadSimple className="text-slate-50" size={22} />
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
        <div className="lgx-row mt-3 rounded-lg p-3">
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
              <ProgressBar readout value={progress!} etaSeconds={etaSeconds} label={`Uploading ${file.name}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

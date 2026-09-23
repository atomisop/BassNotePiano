"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Vendored into public/ (verbatim copy of
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs for the pinned react-pdf
// version below) rather than bundled via webpack's `new URL(...,
// import.meta.url)` or pulled from a CDN:
//  - webpack bundling it: Next's production build runs the whole bundle
//    through Terser, which can't minify a file with top-level ESM
//    import/export ("'import' and 'export' cannot be used outside of
//    module code") — confirmed by hitting exactly that build failure
//    before switching to this approach.
//  - a CDN (cdnjs etc.): this app's CSP is script-src 'self' (worker-src
//    falls back to it), so a cross-origin worker would be silently
//    blocked in production regardless.
// A plain public/ file sidesteps both: Next serves it unprocessed, so
// Terser never touches it, and it's same-origin so CSP allows it.
// react-pdf/pdfjs-dist version: 9.2.1 / 4.8.69 (package.json) — re-copy
// this file from node_modules if that version ever changes.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.2;

/**
 * A real in-app PDF viewer (react-pdf/pdf.js), replacing the old bare
 * <object data=... type="application/pdf"> embed — which relied entirely on
 * the browser's own PDF plugin for chrome (no page nav, no zoom, and no
 * guarantee any given browser even has one), and would have been silently
 * blocked outright by this app's CSP once its `object-src 'none'` directive
 * ships (see next.config.mjs), since that directive exists specifically to
 * block <object>/<embed>/<applet>.
 *
 * "Opened" still fires once, but now on the Document's actual first
 * successful render (onLoadSuccess) rather than unconditionally on mount —
 * a truer match for what "opened this PDF" means than firing before the
 * PDF has necessarily loaded at all.
 */
export function LessonPdfPlayer({ src, title, onOpened }: { src: string; title: string; onOpened: () => void }) {
  const firedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    setPageNumber(1);
    if (!firedRef.current) {
      firedRef.current = true;
      onOpened();
    }
  }

  if (loadError) {
    return (
      <div className="flex h-[75vh] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-400">Your browser can&apos;t preview this PDF inline.</p>
        <a href={src} target="_blank" rel="noreferrer" className="cta-sheen cta-fill rounded-xl px-4 py-2 text-sm font-semibold">
          Open the PDF
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-900">
      <div ref={containerRef} className="flex max-h-[70vh] justify-center overflow-auto bg-slate-950 p-4">
        <Document
          file={src}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={() => setLoadError(true)}
          loading={<div className="flex h-[60vh] w-full items-center justify-center text-sm text-slate-500">Loading PDF…</div>}
        >
          {containerWidth > 0 && (
            <Page
              pageNumber={pageNumber}
              width={containerWidth * scale}
              renderTextLayer
              renderAnnotationLayer
              loading={<div className="flex h-[60vh] w-full items-center justify-center text-sm text-slate-500">Loading page…</div>}
            />
          )}
        </Document>
      </div>

      {/* Toolbar, styled to match LessonVideoPlayer's control bar for a
          consistent look between the two lesson players. */}
      <div className="flex items-center justify-between gap-3 bg-slate-950 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(numPages ?? p, p + 1))}
            disabled={!numPages || pageNumber >= numPages}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
          <span className="ml-1 text-xs text-slate-400">
            {title} · Page {pageNumber} of {numPages ?? "…"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ZoomOut size={16} />
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-slate-400">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-ink/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

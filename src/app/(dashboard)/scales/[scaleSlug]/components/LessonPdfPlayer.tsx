"use client";

import { useEffect, useRef } from "react";

/** Inline PDF embed. Counts as "opened" (and therefore complete) once it's actually mounted and visible — no page-level read-tracking, a simple <object>/<iframe> is enough for this use case per the brief. */
export function LessonPdfPlayer({ src, title, onOpened }: { src: string; title: string; onOpened: () => void }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <object data={src} type="application/pdf" title={title} className="h-[75vh] w-full rounded-2xl bg-slate-900">
      <div className="flex h-[75vh] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-400">Your browser can't preview this PDF inline.</p>
        <a href={src} target="_blank" rel="noreferrer" className="cta-sheen rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">
          Open the PDF
        </a>
      </div>
    </object>
  );
}

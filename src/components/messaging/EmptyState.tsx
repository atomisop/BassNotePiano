export function EmptyState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/10 text-slate-600">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm text-slate-500">Select a conversation to start chatting.</p>
    </div>
  );
}

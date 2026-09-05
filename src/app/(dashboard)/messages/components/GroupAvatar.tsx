export function GroupAvatar({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgb(var(--c-s-50)/0.2)] bg-[rgb(var(--c-s-50)/0.1)] text-[rgb(var(--c-s-50))] ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[45%] w-[45%]">
        <path
          d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM22 20v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

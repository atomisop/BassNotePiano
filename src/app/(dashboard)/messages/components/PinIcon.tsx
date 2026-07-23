export function PinIcon({ filled = false, className = "h-3.5 w-3.5" }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" strokeLinejoin="round" />
    </svg>
  );
}

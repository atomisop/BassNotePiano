export function NavIcon({ path, className = "h-5 w-5 shrink-0" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const ICON_PATHS = {
  roadmap: "M4 6h11a3 3 0 010 6H9a3 3 0 000 6h11M4 6l3-3M4 6l3 3M17 18l3 3M17 18l3-3",
  friends: "M8 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6M17 11a3 3 0 100-6 3 3 0 000 6zM13.5 14c2.9.3 5.5 2.8 5.5 6",
  messages: "M4 5h16v11H8l-4 4V5z",
  lessons: "M8 3v3M16 3v3M4 9h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1zM9 14l2 2 4-4",
  pricing: "M12.59 2.59L21 11l-9 9-8.41-8.41A2 2 0 013 10.17V4a1 1 0 011-1h6.17a2 2 0 011.42.59zM7 7h.01",
  profile: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  admin: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
  settings:
    "M10.3 3.3c.3-1 1.7-1 2 0l.2.7c.2.6.8 1 1.4.8l.7-.2c1-.3 1.8.7 1.3 1.6l-.4.6c-.3.5-.1 1.2.4 1.5l.6.4c.9.5.9 1.9 0 2.4l-.6.4c-.5.3-.7 1-.4 1.5l.4.6c.5.9-.3 1.9-1.3 1.6l-.7-.2c-.6-.2-1.2.2-1.4.8l-.2.7c-.3 1-1.7 1-2 0l-.2-.7c-.2-.6-.8-1-1.4-.8l-.7.2c-1 .3-1.8-.7-1.3-1.6l.4-.6c.3-.5.1-1.2-.4-1.5l-.6-.4c-.9-.5-.9-1.9 0-2.4l.6-.4c.5-.3.7-1 .4-1.5l-.4-.6c-.5-.9.3-1.9 1.3-1.6l.7.2c.6.2 1.2-.2 1.4-.8l.2-.7z",
  about: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.5h.01",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z",
  close: "M6 6l12 12M18 6L6 18",
} as const;

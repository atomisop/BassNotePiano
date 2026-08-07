export function Avatar({ image, label, className = "h-9 w-9" }: { image: string | null; label: string; className?: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-full border border-white/10 bg-slate-800 ${className}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-500">{label.charAt(0).toUpperCase()}</div>
      )}
    </div>
  );
}

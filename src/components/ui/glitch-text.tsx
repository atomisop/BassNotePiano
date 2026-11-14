
/**
 * Text with a looping glitch: two clipped copies (orange and cool cyan) jitter sideways over the word, with a short burst
 * every few seconds. The real text stays in the DOM once (the copies are CSS `content`, hidden from readers).
 * Motion stops for people who ask for reduced motion (see `.glitch-text` in globals.css).
 */
export function GlitchText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`glitch-text ${className}`} data-text={children}>
      {children}
    </span>
  );
}

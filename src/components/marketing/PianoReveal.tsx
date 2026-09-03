import { ScrollFrameSequence } from "@/components/marketing/ScrollFrameSequence";

/**
 * HOMEPAGE REBUILD: piano-explode scroll sequence, sitting right after Hero.
 *
 * The 70 frames in public/piano-explode/ come from a 300-frame, 3840x2160
 * source the user provided (a rendered grand piano opening and its own
 * components, keys/hammers/strings/soundboard, spiraling apart to reveal
 * the instrument's structure). Optimized down from 739MB to 2.8MB before
 * this ever reached the app:
 *   - The source held still on its fully-exploded pose for its entire back
 *     half (frames ~150-300 are visually identical to frame 150), and that's
 *     dead scroll distance with nothing changing, so only the real motion
 *     (frames 1-139) made it in, sampled every other frame (70 frames).
 *   - Resized 3840x2160 -> 1600px wide and re-encoded as WebP (q78): a
 *     scroll-scrubbed sequence doesn't need 4K source frames, and WebP
 *     compresses this kind of photographic/CGI content far better than PNG.
 *
 * Caption ties the visual directly to the app's own real positioning
 * (Solution.tsx's "spelling engine," ProblemStatement's "grammar
 * underneath") rather than being decorative: the piano opening up to show
 * its own named, structured parts is a literal picture of "there's a real
 * system in here, not just memorized shapes."
 */
export function PianoReveal() {
  return (
    <ScrollFrameSequence basePath="/piano-explode" frameCount={70}>
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-white/70">Under the lid</p>
      <h2 className="max-w-2xl text-balance font-serif text-4xl leading-[1.1] text-white sm:text-5xl md:text-6xl">
        It isn&apos;t magic. It&apos;s a system.
      </h2>
      <p className="mt-5 max-w-md text-balance text-base leading-relaxed text-white/80 sm:text-lg">
        And a system can be learned, one real scale at a time.
      </p>
    </ScrollFrameSequence>
  );
}

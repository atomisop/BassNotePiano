// Synthesized rather than an audio file, avoids shipping/licensing a sound
// asset for a two-note chime. Browsers block audio before any user gesture
// on the page, so this is wrapped defensively: a blocked/unsupported
// AudioContext should never surface as a visible error, just silence.
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/** A short two-note chime for a new notification or message. */
export function playNotificationSound() {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.16); // A5
    playTone(ctx, 1318.5, now + 0.09, 0.2); // E6
  } catch {
    // Autoplay restrictions or no Web Audio support, fail silently.
  }
}

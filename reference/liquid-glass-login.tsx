/**
 * Glass Login. Designed & built by Aakash Mehra.
 *
 * A sign-in card made of liquid glass, floating over slow, rising flames and drifting embers.
 * The card, the Sign in button and the Google, Apple and GitHub buttons are all liquid glass
 * (the LiquidGlass section at the bottom of this file, from the Liquid Glass Button): their rims refract and fringe the live fire behind them in Chromium,
 * and fall back to frosted glass in Safari and Firefox.
 *
 * The fire is one WebGL fragment shader (domain-warped noise plus a few layers of embers), rendered
 * at reduced resolution since it is all soft light. It holds still under prefers-reduced-motion.
 *
 * The fields are liquid glass too. Anything passed as children sits behind the card, so dragging
 * the card over it bends it through the glass.
 *
 * Drag the card anywhere by its glass (anywhere that isn't a field or button); it stays on screen.
 *
 * The glass layers are siblings, never ancestors, of each other: an element with a backdrop-filter
 * is a backdrop root, so glass nested inside glass would only see the card's tint, not the flames.
 */
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type FormEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type GlassLoginProvider = "google" | "apple" | "github";

export type GlassLoginProps = {
  title?: string;
  subtitle?: string;
  /** Called with the form values. Return a promise to keep the button in its loading state. */
  onSubmit?: (values: { email: string; password: string }) => void | Promise<void>;
  /** Called when a social button is pressed. */
  onProviderSignIn?: (provider: GlassLoginProvider) => void | Promise<void>;
  forgotPasswordHref?: string;
  onForgotPassword?: () => void;
  className?: string;
  /** Rendered behind the card, over the fire, so the glass refracts it when dragged across. */
  children?: ReactNode;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function GlassLogin({
  title = "Welcome back",
  subtitle = "Sign in to continue",
  onSubmit = () => wait(1400),
  onProviderSignIn = () => wait(1400),
  forgotPasswordHref = "#",
  onForgotPassword,
  className,
  children,
}: GlassLoginProps) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"form" | GlassLoginProvider | null>(null);

  const run = async (kind: NonNullable<typeof pending>, task: () => void | Promise<void>) => {
    if (pending) return;
    setPending(kind);
    try {
      await task();
    } finally {
      setPending(null);
    }
  };

  // drag the card by its glass; fields, links and buttons keep working normally
  const cardRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, button, a, label, textarea, select")) return;
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ...offset.current };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const card = cardRef.current;
    if (!d || !card?.parentElement) return;
    const box = card.parentElement.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const left = r.left - offset.current.x;
    const top = r.top - offset.current.y;
    const x = Math.min(box.right - left - r.width, Math.max(box.left - left, d.x + e.clientX - d.px));
    const y = Math.min(box.bottom - top - r.height, Math.max(box.top - top, d.y + e.clientY - d.py));
    offset.current = { x, y };
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const onDragEnd = () => {
    drag.current = null;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run("form", () =>
      onSubmit({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") }),
    );
  };

  return (
    <div
      className={cn(
        "relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-10 font-sans text-white",
        "bg-[radial-gradient(120%_70%_at_50%_100%,#7a2a0c_0%,#2a0d05_45%,#0a0403_80%)]",
        className,
      )}
    >
      <FlameCanvas />
      {/* Darken the top so the heading reads, leave the fire hot at the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,rgb(10_4_3/0.75),transparent_70%)]"
      />
      {children}

      <div
        ref={cardRef}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="relative w-full max-w-[400px] cursor-grab touch-none active:cursor-grabbing [&_input]:cursor-text"
      >
        <LiquidGlass
          aria-hidden
          radius={32}
          bevelDepth={56}
          scale={72}
          aberration={16}
          frost={0.4}
          tint={0.1}
          className="absolute inset-0 shadow-[0_30px_80px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-1px_0_rgb(255_255_255/0.15)]"
        />

        <form
          onSubmit={handleSubmit}
          aria-busy={pending === "form"}
          className="relative flex flex-col px-6 py-8 sm:px-9 sm:py-10"
        >
          <header className="mb-7 text-center">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] [text-shadow:0_2px_12px_rgb(0_0_0/0.4)]">
              {title}
            </h1>
            <p className="mt-1.5 text-[15px] text-white/65">{subtitle}</p>
          </header>

          <Field id={`${id}-email`} label="Email" icon={<Mail />}>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>

          <Field id={`${id}-password`} label="Password" icon={<Lock />} className="mt-4">
            <input
              id={`${id}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Your password"
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-white/55 transition-colors outline-none hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </Field>

          <div className="mt-3 flex justify-end">
            <a
              href={forgotPasswordHref}
              onClick={
                onForgotPassword
                  ? (e) => {
                      e.preventDefault();
                      onForgotPassword();
                    }
                  : undefined
              }
              className="rounded-md px-1 text-[13px] font-medium text-white/70 underline-offset-4 transition-colors outline-none hover:text-white hover:underline focus-visible:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Forgot password?
            </a>
          </div>

          <GlassButton
            type="submit"
            disabled={pending !== null}
            primary
            className="mt-6 h-[52px] w-full text-[15px] font-semibold"
          >
            {pending === "form" ? (
              <>
                <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" />
                Signing in
              </>
            ) : (
              "Sign in"
            )}
          </GlassButton>

          <div className="my-6 flex items-center gap-3 text-[13px] text-white/50">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/25" />
            or continue with
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/25" />
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {providers.map(({ key, label, Icon }) => (
              <GlassButton
                key={key}
                type="button"
                aria-label={`Continue with ${label}`}
                disabled={pending !== null}
                onClick={() => run(key, () => onProviderSignIn(key))}
                className="h-12 text-[14px] font-medium"
              >
                {pending === key ? (
                  <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" />
                ) : (
                  <Icon className="size-[18px] shrink-0" />
                )}
                <span className="max-[359px]:sr-only">{label}</span>
              </GlassButton>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

export default GlassLogin;

/* ---------------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------------- */

const inputClass =
  "peer relative h-12 w-full rounded-2xl bg-black/15 pr-4 pl-11 text-[15px] text-white ring-1 ring-white/12 transition-[box-shadow,background-color] outline-none ring-inset placeholder:text-white/35 hover:ring-white/20 focus:bg-black/20 focus:ring-2 focus:ring-white/60 [&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_rgb(40_18_10)]";

function Field({
  id,
  label,
  icon,
  className,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block pl-1 text-[13px] font-medium text-white/80">
        {label}
      </label>
      <div className="relative">
        <LiquidGlass aria-hidden radius={16} bevelDepth={22} scale={36} aberration={10} frost={0.4} tint={0.06} className="pointer-events-none absolute inset-0" />
        {children}
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/45 transition-colors peer-focus:text-white/90 [&_svg]:size-[18px]">
          {icon}
        </span>
      </div>
    </div>
  );
}

function GlassButton({
  primary,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "group relative rounded-full outline-none select-none transition-transform active:scale-[0.98] disabled:cursor-default",
        "focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a0a06]",
        className,
      )}
    >
      <LiquidGlass
        aria-hidden
        radius={26}
        bevelDepth={22}
        scale={primary ? 48 : 36}
        aberration={14}
        frost={0.4}
        tint={0.12}
        className={cn(
          "absolute inset-0 shadow-[0_8px_24px_rgb(0_0_0/0.28),inset_0_1px_0_rgb(255_255_255/0.55)]",
        )}
        style={{ backgroundColor: primary ? "rgb(255 128 56 / 0.34)" : "rgb(255 255 255 / 0.07)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-white/0 transition-colors group-hover:bg-white/10 group-active:bg-white/15 group-disabled:bg-white/0"
      />
      <span className="relative flex size-full items-center justify-center gap-2 [text-shadow:0_1px_8px_rgb(0_0_0/0.35)] group-disabled:opacity-80">
        {children}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Brand glyphs
 * ------------------------------------------------------------------------- */

type IconProps = { className?: string };

function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={className}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GitHubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const providers = [
  { key: "google", label: "Google", Icon: GoogleIcon },
  { key: "apple", label: "Apple", Icon: AppleIcon },
  { key: "github", label: "GitHub", Icon: GitHubIcon },
] as const;

/* ---------------------------------------------------------------------------
 * Fire background
 * ------------------------------------------------------------------------- */

// Fraction of device pixels the shader renders; the fire is soft, so it upscales cleanly.
const RENDER_SCALE = 0.4;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}

// Small glowing sparks on a scrolling grid: one chance of a spark per cell, per layer.
float embers(vec2 p, float t){
  float acc = 0.;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float density = 5. + fl * 4.;
    vec2 g = p * density;
    g.y -= t * (.9 + fl * .45);
    g.x += sin(g.y * .45 + fl * 2.1 + t * .3) * .55;
    vec2 id = floor(g), f = fract(g) - .5;
    float r = hash(id + fl * 13.7);
    if (r < .62) continue;
    vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - .5) * .6;
    float d = length(f - o) / density;
    float twinkle = .55 + .45 * sin(t * (3. + r * 5.) + r * 50.);
    float size = .0016 + .0018 * hash(id + 9.3);
    acc += smoothstep(size * 2.6, 0., d) * twinkle * (1.2 - fl * .25);
  }
  return acc;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - .5) * max(ar, 1.), uv.y);
  float t = uTime * .35; // slow motion

  // Domain warp scrolling upward, so the shapes rise and curl like heat.
  vec2 w = vec2(fbm(p * 1.7 + vec2(0., -t * .28)), fbm(p * 1.7 + vec2(4.1, -t * .24)));
  float n = fbm(vec2(p.x * 2.4, p.y * 1.5) + w * 2. + vec2(0., -t * .85));

  // Fire is hottest along the bottom and licks up into tongues that thin out with height.
  float height = uv.y * 1.5 + abs(uv.x - .5) * .5;
  float flame = clamp(n * 1.5 - height + .1, 0., 1.);

  // Colour comes from heat, not screen height, so the layers run parallel to each tongue's edge:
  // a blue outer skin, then red, orange, yellow and a white-hot core.
  vec3 col = mix(vec3(.045, .014, .01), vec3(.012, .006, .008), uv.y);
  vec3 fire = vec3(.35, .03, .02) * smoothstep(.0, .05, flame);
  fire = mix(fire, vec3(.6, .06, .03), smoothstep(.06, .16, flame));
  fire = mix(fire, vec3(.95, .3, .04), smoothstep(.18, .3, flame));
  fire = mix(fire, vec3(1., .62, .14), smoothstep(.34, .48, flame));
  fire = mix(fire, vec3(1., .86, .6), smoothstep(.62, .85, flame));
  // blue at the bottom: the innermost layer near the base, its top edge following the flames
  float blue = smoothstep(.0, .12, flame - .3 - uv.y * 2.4);
  fire = mix(fire, mix(vec3(.05, .3, 1.), vec3(.55, .8, 1.), smoothstep(.2, .7, flame - uv.y * 2.4)), blue);
  col += fire * (.4 + .45 * smoothstep(.0, .5, flame));

  // Wide, slow ambient bloom so the upper half is never flat black.
  float bloom = fbm(p * .7 + vec2(t * .03, -t * .05));
  col += vec3(.42, .1, .04) * bloom * bloom * smoothstep(1.1, .2, uv.y) * .6;

  float e = embers(p, t) * smoothstep(1.05, .1, uv.y);
  // most embers glow orange, some burn blue-white
  col += mix(vec3(1., .5, .18), vec3(.45, .7, 1.), step(.62, fbm(p * 3. + 11.))) * e;

  // Dither against banding in the dark gradients.
  col += (hash(gl_FragCoord.xy + fract(t)) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

function FlameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, depth: false });
    if (!canvas || !gl) return; // The container's CSS gradient stands in.

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let time = 12; // Start mid-burn so the first frame is already alight.
    let raf = 0;

    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 24 - 2) return; // 24fps: slow flames don't need more, and each frame re-renders the glass
      last = now;
      time = 12 + (now - start) / 1000;
      draw();
    };
    const play = () => {
      cancelAnimationFrame(raf);
      if (reduce.matches) draw();
      else raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      const s = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * s));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * s));
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw();
    });
    ro.observe(canvas);
    reduce.addEventListener("change", play);
    play();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      reduce.removeEventListener("change", play);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

/* ---------------------------------------------------------------------------
 * Liquid glass (from the Liquid Glass Button component)
 * ------------------------------------------------------------------------- */

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  /** Corner radius in px. Default 999 (pill). */
  radius?: number;
  /** Rim band that bends light, in px. */
  bevelDepth?: number;
  /** Displacement strength in px. */
  scale?: number;
  /** Chromatic aberration spread in px. */
  aberration?: number;
  /** Extra blur after refraction, in px. */
  frost?: number;
  /** White body tint 0–1. */
  tint?: number;
};

/**
 * Liquid glass surface. A Snell's-law displacement map bends whatever sits
 * behind the element through an SVG filter used as `backdrop-filter`.
 * Chromium refracts; Safari, Firefox and reduced-transparency fall back to
 * glassmorphism (frosted, translucent, bright rim).
 */
export function LiquidGlass({
  children,
  className,
  contentClassName,
  radius = 999,
  bevelDepth = 14,
  scale = 48,
  aberration = 4,
  frost = 0.4,
  tint = 0.12,
  style,
  ...rest
}: LiquidGlassProps) {
  const reactId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [filter, setFilter] = useState<{ id: string; svg: string } | null>(
    null,
  );
  // "pending" on the server and during hydration, then the real mode.
  const mode = useSyncExternalStore(noopSubscribe, detectMode, () => "pending");

  useEffect(() => {
    const el = rootRef.current;
    if (!el || mode !== "pending") return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border box, so the map matches the backdrop-filter layer.
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;
      setSize({
        w: Math.max(1, Math.round(width)),
        h: Math.max(1, Math.round(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode !== "pending" || size.w <= 1 || size.h <= 1) return;
    let cancelled = false;

    (async () => {
      const mapUrl = await generateDisplacementBlobUrl({
        width: size.w,
        height: size.h,
        radius: Math.min(radius, size.w / 2, size.h / 2),
        bevelDepth: Math.min(bevelDepth, Math.min(size.w, size.h) / 2),
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      // Decode the map before the filter attaches.
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = mapUrl;
      });
      if (cancelled) {
        URL.revokeObjectURL(mapUrl);
        return;
      }
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = mapUrl;

      // Fresh id each rebuild, because browsers cache filter output by id.
      const id = `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`;
      setFilter({
        id,
        svg: buildFilterSvg({
          id,
          mapUrl,
          width: size.w,
          height: size.h,
          scale,
          aberration,
          frost,
        }),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    size.w,
    size.h,
    radius,
    bevelDepth,
    scale,
    aberration,
    frost,
    reactId,
  ]);

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    },
    [],
  );

  const backdrop =
    mode === "opaque"
      ? "none"
      : mode === "simple"
        ? "blur(16px) saturate(1.8) brightness(1.05)"
        : filter
          ? `url(#${filter.id}) blur(0.5px) saturate(1.85) brightness(1.02)`
          : "blur(10px) saturate(1.6) brightness(1.04)";

  return (
    <div
      ref={rootRef}
      data-refract={mode === "pending" && filter ? "true" : "false"}
      className={cn(
        "relative overflow-hidden",
        mode === "simple" &&
          "bg-gradient-to-b from-white/25 to-white/10 ring-1 ring-white/35 ring-inset",
        mode === "opaque" && "bg-neutral-900",
        className,
      )}
      style={{
        borderRadius: radius,
        backgroundColor:
          mode === "pending" ? `rgb(255 255 255 / ${tint})` : undefined,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        ...style,
      }}
      {...rest}
    >
      {filter ? (
        <span
          key={filter.id}
          aria-hidden
          className="pointer-events-none absolute size-0 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: filter.svg }}
        />
      ) : null}
      {contentClassName ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

type GlassMode = "pending" | "simple" | "opaque";

const noopSubscribe = () => () => {};

function detectMode(): GlassMode {
  if (prefersReducedTransparency()) return "opaque";
  if (isSafariLike() || !supportsUrlBackdropFilter()) return "simple";
  return "pending";
}

function supportsUrlBackdropFilter() {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return (
    CSS.supports("backdrop-filter", "url(#x)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#x)")
  );
}

function prefersReducedTransparency() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

function isSafariLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

/* ---------------------------------------------------------------------------
 * Displacement map
 * R = horizontal bend, G = vertical bend, B = rim specular, A = shape mask.
 * Neutral grey (128) means zero displacement.
 * ------------------------------------------------------------------------- */

type DisplacementOptions = {
  width: number;
  height: number;
  radius: number;
  bevelDepth: number;
  gain?: number;
  light?: { x: number; y: number };
  dpr?: number;
};

/** Signed distance to a rounded box centred at the origin. <0 inside. */
function sdRoundedBox(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  r: number,
) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return inside + outside - r;
}

/** Squircle-dome slope → Snell's-law bend. `x` = 0 at the rim, 1 at centre. */
function bendFromDepth(x: number) {
  const u = 1 - Math.min(1, Math.max(0, x));
  const denom = (1 - u ** 4) ** 0.75;
  if (denom < 1e-6) return 0;
  const thetaI = Math.atan(Math.min(u ** 3 / denom, 8));
  const sinT = Math.sin(thetaI) / 1.5;
  if (sinT >= 1) return Math.sin(thetaI);
  return Math.sin(thetaI - Math.asin(sinT));
}

/** φ(d) = ∫ bend along the distance from the rim. */
function buildPhiTable(bevelPx: number) {
  const n = Math.max(1, Math.ceil(bevelPx));
  const phi = new Float32Array(n + 1);
  for (let d = 1; d <= n; d++) phi[d] = phi[d - 1] + bendFromDepth(d / n);
  return phi;
}

function samplePhi(phi: Float32Array, depth: number) {
  const max = phi.length - 1;
  if (depth <= 0) return phi[0];
  if (depth >= max) return phi[max];
  const i = Math.floor(depth);
  const f = depth - i;
  return phi[i] * (1 - f) + phi[i + 1] * f;
}

function computeDisplacementData(opts: DisplacementOptions) {
  const dpr = opts.dpr ?? 1;
  const gain = opts.gain ?? 1.35;
  const light = opts.light ?? { x: -0.55, y: -0.85 };
  const lightLen = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / lightLen;
  const ly = light.y / lightLen;

  const W = Math.max(1, Math.round(opts.width * dpr));
  const H = Math.max(1, Math.round(opts.height * dpr));
  const halfW = W / 2;
  const halfH = H / 2;
  const r = Math.min(opts.radius * dpr, halfW, halfH);
  const bevel = Math.max(1, opts.bevelDepth * dpr);
  const phi = buildPhiTable(bevel);

  // Height field over the shape, then displace along its gradient.
  const field = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const d = sdRoundedBox(x - halfW + 0.5, py, halfW, halfH, r);
      field[y * W + x] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d));
    }
  }

  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5;
      const i = (y * W + x) << 2;
      const d = sdRoundedBox(px, py, halfW, halfH, r);

      if (d > 0) {
        data[i] = data[i + 1] = data[i + 2] = 128;
        data[i + 3] = 0;
        continue;
      }

      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(W - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(H - 1, y + 1);
      const dPhiX = (field[y * W + x1] - field[y * W + x0]) / (x1 - x0 || 1);
      const dPhiY = (field[y1 * W + x] - field[y0 * W + x]) / (y1 - y0 || 1);

      // Cap so the rim compresses but never folds over itself.
      const dx = Math.max(-1, Math.min(1, dPhiX * gain));
      const dy = Math.max(-1, Math.min(1, dPhiY * gain));

      let specular = 0;
      if (d >= -bevel) {
        const gx =
          sdRoundedBox(px + 1, py, halfW, halfH, r) -
          sdRoundedBox(px - 1, py, halfW, halfH, r);
        const gy =
          sdRoundedBox(px, py + 1, halfW, halfH, r) -
          sdRoundedBox(px, py - 1, halfW, halfH, r);
        const len = Math.hypot(gx, gy) || 1;
        const dot = (gx / len) * lx + (gy / len) * ly;
        const rim = 1 - Math.min(1, -d / bevel);
        specular = (Math.max(0, dot) + Math.max(0, -dot) * 0.35) * rim;
      }

      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = Math.round(specular * 255);
      data[i + 3] = 255;
    }
  }

  return { data, width: W, height: H };
}

/** PNG blob URL for feImage (WebKit rejects data: URIs inside feImage). */
async function generateDisplacementBlobUrl(opts: DisplacementOptions) {
  const { data, width, height } = computeDisplacementData(opts);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode displacement map");
  return URL.createObjectURL(blob);
}

/* ---------------------------------------------------------------------------
 * SVG filter
 * ------------------------------------------------------------------------- */

type FilterOptions = {
  id: string;
  mapUrl: string;
  width: number;
  height: number;
  scale: number;
  aberration: number;
  frost: number;
};

function buildFilterSvg({
  id,
  mapUrl,
  width,
  height,
  scale,
  aberration,
  frost,
}: FilterOptions) {
  const pad = Math.ceil(scale + aberration + 4);
  const px = (pad / Math.max(1, width)) * 100;
  const py = (pad / Math.max(1, height)) * 100;
  const region = `x="-${px.toFixed(3)}%" y="-${py.toFixed(3)}%" width="${(100 + 2 * px).toFixed(3)}%" height="${(100 + 2 * py).toFixed(3)}%"`;

  // Pixel-sized map matched to the lens; % units wash out the rim bend.
  const map = `<feImage href="${mapUrl}" xlink:href="${mapUrl}" x="0" y="0" width="${width}" height="${height}" result="map" preserveAspectRatio="none"/>`;
  const displace = (s: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;

  // One pass without aberration, so no screen-blend seams.
  const body =
    aberration <= 0
      ? `${displace(scale, "rgb")}`
      : `${displace(scale + aberration, "dispR")}
  <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
  ${displace(scale, "dispG")}
  <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
  ${displace(Math.max(0, scale - aberration), "dispB")}
  <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen" result="rgb"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="${id}" color-interpolation-filters="sRGB" ${region}>
  ${map}
  ${body}
  <feGaussianBlur in="rgb" stdDeviation="${frost}"/>
</filter></svg>`;
}

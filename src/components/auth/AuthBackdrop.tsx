"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

/** The two auth pages that share the studio photo under the glass card (CLAUDE.md, "Log in is a page"). */
export const PHOTO_AUTH_PATHS = ["/login", "/register"] as const;

export function isPhotoAuthPath(pathname: string | null | undefined): boolean {
  return !!pathname && (PHOTO_AUTH_PATHS as readonly string[]).includes(pathname);
}

/**
 * The full-screen photo behind /login and /register (a dark green room with a yellow sofa and two guitars), like the 21st.dev
 * "Liquid Glass Login" demo's background: the glass card on top visibly bends it. The photo is small (640 x 960), so on wide
 * screens it is softly blurred and darker, and the overlay is strong enough for the white text above it to pass contrast.
 * Every other auth page keeps the plain background.
 */
export function AuthBackdrop() {
  const pathname = usePathname();
  if (!isPhotoAuthPath(pathname)) return null;
  return (
    <div aria-hidden data-auth-photo className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <Image
        src="/auth/login-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover md:scale-110 md:blur-[14px]"
      />
      {/* Darker at the top, where the logo and the back link sit, and darker overall on wide screens. */}
      <div className="absolute inset-0 bg-black/60 md:bg-black/65" />
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-black/60 to-transparent" />
    </div>
  );
}

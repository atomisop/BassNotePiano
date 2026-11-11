"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { safeCallbackPath } from "@/lib/safeRedirect";
import { startNavigation } from "@/lib/navigationState";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

function LoginCard() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const router = useRouter();
  const { data: session, status } = useSession();

  // Already signed in: this screen has nothing for you, go straight into the app. Checked
  // against the server's own view of the session, so a stale cookie cannot cause a loop.
  useEffect(() => {
    // An ended session can still read as "authenticated" with an empty user; only a real user id counts.
    if (status !== "authenticated" || !session?.user?.id) return;
    let cancelled = false;
    // Ask the server whether this session is still good. The browser's copy can outlive the account (deleted, banned,
    // demoted and signed out): without this check the app sends it to a page, the page sends it back here, and it loops.
    // A session the server no longer accepts is cleared, so the form shows and signing in again starts clean.
    fetch("/api/me/status", { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          void signOut({ redirect: false });
          return;
        }
        const safe = safeCallbackPath(callbackUrl);
        startNavigation();
        router.replace(safe === "/" ? "/dashboard" : safe);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, session, callbackUrl, router]);

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="w-full glass-surface-elevated p-7">
      {/* The same title and line as the Log in panel on the public pages (MarketingNav), so the two ways in read as one. */}
      <AuthHeading title="Log in">Pick up your roadmap right where you left it.</AuthHeading>
      <div className="mt-6">
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}

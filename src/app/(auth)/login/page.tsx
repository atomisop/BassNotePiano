"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeCallbackPath } from "@/lib/safeRedirect";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

function LoginCard() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const router = useRouter();
  const { status } = useSession();

  // Already signed in: this screen has nothing for you, go straight into the app. Checked
  // against the server's own view of the session, so a stale cookie cannot cause a loop.
  useEffect(() => {
    if (status !== "authenticated") return;
    const safe = safeCallbackPath(callbackUrl);
    router.replace(safe === "/" ? "/dashboard" : safe);
  }, [status, callbackUrl, router]);

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="w-full glass-surface-elevated p-7">
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Welcome back</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Log in to continue</h1>
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

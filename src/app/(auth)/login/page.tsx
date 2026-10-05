"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { LoginForm } from "@/components/auth/LoginForm";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", bounce: 0, duration: 0.4 } },
};

// Where a visitor was headed, in plain words, for the line under the title when
// they were sent here from a signed-in page (the form is the first thing they
// see, so say what it is for).
const DESTINATION_NAMES: [prefix: string, name: string][] = [
  ["/lessons", "Lessons"],
  ["/scales", "your lesson"],
  ["/messages", "Messages"],
  ["/friends", "Friends"],
  ["/schedule", "your schedule"],
  ["/account", "Settings"],
  ["/profile", "your profile"],
  ["/billing", "Billing"],
  ["/admin", "the admin area"],
  ["/dashboard", "your dashboard"],
];

function destinationName(callbackUrl: string | null): string | null {
  if (!callbackUrl) return null;
  const match = DESTINATION_NAMES.find(([prefix]) => callbackUrl === prefix || callbackUrl.startsWith(`${prefix}/`) || callbackUrl.startsWith(`${prefix}?`));
  return match ? match[1] : null;
}

function LoginCard() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const destination = destinationName(searchParams.get("callbackUrl"));

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="w-full glass-surface-elevated p-7">
      <p className="text-small font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-s-50)/0.8)]">Welcome back</p>
      <h1 className="font-hero text-hero font-bold text-balance mt-1.5 text-slate-50">Log in to continue</h1>
      <p className="mt-1.5 text-small text-slate-500">
        {destination ? `Log in to open ${destination}.` : "Pick up your roadmap right where you left it."}
      </p>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { isProtectedPath } from "@/lib/csp";

/** Sign out and come back to the same link (checked again after sign-in), or stay put in the current account. */
export function WrongAccountActions({ next, currentEmail }: { next: string; currentEmail: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-5 grid gap-2">
      <Button
        type="button"
        loading={busy}
        onClick={() => {
          setBusy(true);
          // A page that needs an account asks for sign-in first (and is checked again after); a public one (unsubscribe) just opens.
          void signOut({ callbackUrl: isProtectedPath(next.split("?")[0]) ? `/login?callbackUrl=${encodeURIComponent(next)}` : next });
        }}
      >
        Sign out and open it with the right account
      </Button>
      <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
        Stay signed in as {currentEmail}
      </Link>
    </div>
  );
}

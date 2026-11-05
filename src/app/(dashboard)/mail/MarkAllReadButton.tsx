"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllMailReadAction } from "./actions";
import { announceChange } from "@/lib/liveEvents";
import { MorphingSquare } from "@/components/ui/morphing-square";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllMailReadAction();
          announceChange("notifications");
          router.refresh();
        })
      }
      variant="secondary"
    >
      {pending && <MorphingSquare size={14} className="mr-1.5 shrink-0" />}
      Mark all read
    </Button>
  );
}

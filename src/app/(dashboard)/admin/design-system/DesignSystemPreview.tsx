"use client";

import { useState } from "react";
import { BellIcon, PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Hero } from "@/components/ui/Hero";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Tabs } from "@/components/ui/Tabs";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";

const SWATCHES = [
  { name: "Ink (ground)", cls: "bg-slate-950" },
  { name: "Surface", cls: "bg-slate-900" },
  { name: "Line", cls: "bg-slate-700" },
  { name: "Muted text", cls: "bg-slate-500" },
  { name: "Paper (text)", cls: "bg-slate-50" },
  { name: "Signal: tap this", cls: "bg-signal" },
  { name: "Danger", cls: "bg-danger" },
];

type Tab = "progress" | "done" | "badges";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-(--space-group)">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </section>
  );
}

export function DesignSystemPreview() {
  const [tab, setTab] = useState<Tab>("progress");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-(--space-section) pb-16">
      {/* The three planes, together: back-plane type, the subject card
          overlapping it, and the controls on top. */}
      <Section label="Two planes of depth">
        <div className="relative overflow-hidden pt-4">
          <Card className="relative z-(--z-mid) max-w-2xl">
            <Eyebrow>Scale 4</Eyebrow>
            <Hero as="h2" className="mt-2">Tizita Major</Hero>
            <p className="mt-3 max-w-[60ch] text-body text-slate-300">
              Body text is only for real reading, like lesson instructions. Everything else on a
              screen is small and tidy, grouped with spacing and small labels instead of
              medium headings.
            </p>
            <div className="relative z-(--z-front) mt-6 flex flex-wrap gap-2">
              <Button>Continue lesson</Button>
              <Button variant="secondary">Scale chart</Button>
            </div>
          </Card>
        </div>
      </Section>

      <Section label="Type: three tiers only">
        <Card className="space-y-4">
          <p className="font-hero text-hero font-bold text-slate-50">Hero</p>
          <p className="text-body text-slate-200">Body (16px): reading text such as instructions and chat messages.</p>
          <p className="text-small text-slate-400">Small (13px): labels, buttons, meta lines, everything else.</p>
        </Card>
      </Section>

      <Section label="Color: ink, paper, one signal">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className={`h-16 rounded-control border border-ink/10 shadow-plane-mid ${s.cls}`} />
              <p className="text-small text-slate-400">{s.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Text link</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="icon" variant="secondary" aria-label="Add">
            <PlusIcon />
          </Button>
        </div>
      </Section>

      <Section label="Inputs">
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <Input placeholder="Search @username" aria-label="Search by username" />
          <Input placeholder="Disabled" aria-label="Disabled example" disabled />
        </div>
      </Section>

      <Section label="Tabs">
        <Tabs<Tab>
          label="Learning views"
          value={tab}
          onChange={setTab}
          items={[
            { id: "progress", label: "In progress", count: 3 },
            { id: "done", label: "Completed", count: 1 },
            { id: "badges", label: "Badges" },
          ]}
        />
      </Section>

      <Section label="Cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card interactive>
            <Eyebrow>Scale 1</Eyebrow>
            <p className="mt-2 text-body font-semibold text-slate-50">Major scale</p>
            <p className="mt-1 text-small text-slate-400">3 of 4 steps</p>
          </Card>
          <Card selected>
            <Eyebrow>Scale 2</Eyebrow>
            <p className="mt-2 text-body font-semibold text-slate-50">Natural minor</p>
            <p className="mt-1 text-small text-slate-400">Selected</p>
          </Card>
          <Card muted>
            <Eyebrow>Scale 3</Eyebrow>
            <p className="mt-2 text-body font-semibold text-slate-50">Harmonic minor</p>
            <Badge tone="locked" className="mt-2">Locked</Badge>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <Avatar image={null} label="Sean" />
              <div>
                <p className="text-small font-semibold text-slate-50">Sean</p>
                <p className="text-small text-slate-400">@sean_test</p>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      <Section label="Status (never green)">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success">Saved</Badge>
          <Badge tone="warning">Payment due</Badge>
          <Badge tone="danger">Payment failed</Badge>
          <Badge tone="locked">Locked</Badge>
        </div>
      </Section>

      <Section label="Dialog, toast, loading, empty">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => toast.success("Profile saved")}>
            <BellIcon /> Show toast
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </Card>
          <EmptyState
            title="No friends yet"
            description="Search by username to find other students and practice together."
            actionLabel="Find people"
            actionHref="/friends"
          />
        </div>
      </Section>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Leave this group?"
        description="You can rejoin if someone adds you again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setDialogOpen(false)}>
              Leave group
            </Button>
          </>
        }
      >
        A bottom sheet on phones and a centered dialog on larger screens.
      </Dialog>
    </div>
  );
}

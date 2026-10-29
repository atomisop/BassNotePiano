"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { logAudit } from "@/lib/audit";
import { reportError } from "@/lib/reportError";
import { addScale, createRoadmap, moveRoadmap, moveScale, updateRoadmap, RoadmapError, type RoadmapInput, type ScaleInput } from "@/lib/roadmaps";
import { ROADMAP_INSTRUMENTS, ROADMAP_LEVELS, isRoadmapArtwork } from "@/lib/roadmapRules";

type Result = { ok: true } | { ok: false; error: string };

/** The curriculum's shape is the owner's to change, like prices and settings. */
async function requireOwner() {
  const session = await getServerAuthSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/roadmaps");
  if (session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) redirect("/dashboard");
  return session.user;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanRoadmap(input: unknown): RoadmapInput | string {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = text(raw.name, 60);
  if (name.length < 2) return "Give the roadmap a name.";
  const instrument = text(raw.instrument, 20);
  const level = text(raw.level, 20);
  const artwork = text(raw.artwork, 20);
  if (instrument && !(ROADMAP_INSTRUMENTS as readonly string[]).includes(instrument)) return "Pick an instrument from the list.";
  if (level && !(ROADMAP_LEVELS as readonly string[]).includes(level)) return "Pick a level from the list.";
  if (!isRoadmapArtwork(artwork)) return "Pick a picture from the list.";
  return { name, description: text(raw.description, 300) || null, instrument: instrument || null, level: level || null, artwork };
}

function cleanScale(input: unknown): ScaleInput | string {
  const raw = (input ?? {}) as Record<string, unknown>;
  const code = text(raw.code, 30);
  const title = text(raw.title, 80);
  const formula = text(raw.formula, 60);
  if (!code) return "Give the scale a short label, like Scale 15.";
  if (title.length < 2) return "Give the scale a title.";
  if (!formula) return "Add the scale's formula, like 1-2-b3-4-5-b6-b7.";
  return { code, title, formula, description: text(raw.description, 500) || null };
}

async function run(work: () => Promise<void>): Promise<Result> {
  try {
    await work();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoadmapError) return { ok: false, error: err.message };
    reportError(err, "roadmap admin");
    return { ok: false, error: "That did not save. Try again." };
  }
}

export async function createRoadmapAction(input: unknown): Promise<Result> {
  const owner = await requireOwner();
  const clean = cleanRoadmap(input);
  if (typeof clean === "string") return { ok: false, error: clean };
  return run(async () => {
    const r = await createRoadmap(clean);
    await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "roadmap.create", targetType: "Roadmap", targetId: r.id, detail: r.name });
  });
}

export async function updateRoadmapAction(id: unknown, input: unknown): Promise<Result> {
  const owner = await requireOwner();
  const clean = cleanRoadmap(input);
  if (typeof clean === "string") return { ok: false, error: clean };
  const roadmapId = text(id, 40);
  const visible = (input as { visible?: unknown } | null)?.visible === true;
  return run(async () => {
    const r = await updateRoadmap(roadmapId, { ...clean, visible });
    await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "roadmap.update", targetType: "Roadmap", targetId: r.id, detail: `${r.name}${visible ? "" : " (hidden)"}` });
  });
}

export async function moveRoadmapAction(id: unknown, direction: unknown): Promise<Result> {
  const owner = await requireOwner();
  const dir = direction === "up" ? "up" : "down";
  const roadmapId = text(id, 40);
  return run(async () => {
    await moveRoadmap(roadmapId, dir);
    await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "roadmap.move", targetType: "Roadmap", targetId: roadmapId, detail: dir });
  });
}

export async function addScaleAction(roadmapId: unknown, input: unknown): Promise<Result> {
  const owner = await requireOwner();
  const clean = cleanScale(input);
  if (typeof clean === "string") return { ok: false, error: clean };
  return run(async () => {
    const s = await addScale(text(roadmapId, 40), clean);
    await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "scale.create", targetType: "ScaleGroup", targetId: s.id, detail: `${s.code} ${s.title}` });
  });
}

export async function moveScaleAction(id: unknown, direction: unknown): Promise<Result> {
  const owner = await requireOwner();
  const dir = direction === "up" ? "up" : "down";
  const scaleId = text(id, 40);
  return run(async () => {
    await moveScale(scaleId, dir);
    await logAudit({ actorId: owner.id, actorEmail: owner.email, action: "scale.move", targetType: "ScaleGroup", targetId: scaleId, detail: dir });
  });
}

import { NextResponse } from "next/server";
import { reportError } from "@/lib/reportError";
import { getServerAuthSession } from "@/lib/auth";
import { canAccessScale } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/siteSettings";
import { getLessonObject } from "@/lib/storage";
import { watermarkPdf } from "@/lib/lessonWatermark";
import { RateLimitError, consumeRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The only way a lesson file reaches a browser. It checks the student's access the same way the lesson page does
// (including the free trial's first few lessons), stamps their name on every PDF page, and is never cached.
export async function GET(request: Request, props: { params: Promise<{ lessonId: string }> }) {
  const params = await props.params;
  const session = await getServerAuthSession();
  if (!session?.user) return new NextResponse("Sign in to open this file.", { status: 401 });

  const lesson = await prisma.lesson.findUnique({
    where: { id: params.lessonId },
    select: { id: true, order: true, type: true, fileUrl: true, fileName: true, scaleGroup: { select: { slug: true } } },
  });
  if (!lesson) return new NextResponse("Not found.", { status: 404 });

  const access = await canAccessScale(session.user.id, lesson.scaleGroup.slug);
  if (!access?.canAccess) return new NextResponse("You do not have access to this lesson.", { status: 403 });
  if (access.reason === "trial" && lesson.order >= (await getNumberSetting("trial.lessonCount"))) {
    return new NextResponse("This lesson is not part of the free trial.", { status: 403 });
  }

  try {
    await consumeRateLimit(prisma, `lessonfile:${session.user.id}`, { windowMinutes: 60, max: 150, message: "You have opened a lot of files. Please wait a little and try again." });
  } catch (err) {
    if (err instanceof RateLimitError) return new NextResponse(err.message, { status: 429 });
    throw err;
  }

  const baseHeaders: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${lesson.fileName.replace(/[^\w.-]+/g, "_")}"`,
  };

  if (lesson.type === "PDF") {
    const object = await getLessonObject(lesson.fileUrl).catch(() => null);
    if (!object?.Body) return new NextResponse("File not found.", { status: 404 });
    const original = await object.Body.transformToByteArray();
    const label = `${session.user.name ?? "Student"} (${session.user.email ?? session.user.id})`;
    // If a file cannot be stamped (damaged or locked), the student is not shown it unstamped.
    const stamped = await watermarkPdf(original, label).catch((err) => {
      reportError(err, `Could not watermark lesson ${lesson.id}`);
      return null;
    });
    if (!stamped) return new NextResponse("This file could not be prepared. Please tell your teacher.", { status: 500 });
    return new NextResponse(Buffer.from(stamped), { headers: { ...baseHeaders, "Content-Type": "application/pdf" } });
  }

  // Video: pass byte ranges through so seeking works.
  const range = request.headers.get("range") ?? undefined;
  const object = await getLessonObject(lesson.fileUrl, range).catch(() => null);
  if (!object?.Body) return new NextResponse("File not found.", { status: 404 });
  const headers: Record<string, string> = { ...baseHeaders, "Content-Type": object.ContentType ?? "video/mp4", "Accept-Ranges": "bytes" };
  if (object.ContentLength != null) headers["Content-Length"] = String(object.ContentLength);
  if (object.ContentRange) headers["Content-Range"] = object.ContentRange;
  return new NextResponse(object.Body.transformToWebStream(), { status: range && object.ContentRange ? 206 : 200, headers });
}

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/adminNotifications";
import { prisma } from "@/lib/prisma";

// Owner-only CSV downloads of the people list and of payments.

/** Quotes a cell, and stops spreadsheets from running one that starts like a formula. */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(req: Request) {
  const session = await getServerAuthSession();
  if (!session?.user || session.user.role !== "ADMIN" || !isOwnerEmail(session.user.email)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const type = new URL(req.url).searchParams.get("type");

  if (type === "people") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { name: true, email: true, role: true, createdAt: true, emailVerified: true, classCredits: true, lastActivityDate: true },
    });
    const body = csv([
      ["name", "email", "role", "joined", "verified", "credits", "last_active"],
      ...users.map((u) => [u.name, u.email, u.role, u.createdAt, u.emailVerified ? "yes" : "no", u.classCredits, u.lastActivityDate]),
    ]);
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="people.csv"' } });
  }

  if (type === "payments") {
    const payments = await prisma.zellePayment.findMany({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, amountCents: true, status: true, method: true, purpose: true, user: { select: { name: true, email: true } } },
    });
    const body = csv([
      ["date", "student", "email", "amount", "status", "method", "purpose"],
      ...payments.map((p) => [p.createdAt, p.user.name, p.user.email, (p.amountCents / 100).toFixed(2), p.status, p.method, p.purpose]),
    ]);
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments.csv"' } });
  }

  return new NextResponse("Bad request", { status: 400 });
}

import { describe, expect, it, vi } from "vitest";

// A signed-in STUDENT is blocked from the admin area by the server, not just shown no menu. Every admin server action, the admin
// layout and the admin CSV export are called with a student's session, and the database is booby-trapped: touching it fails the test.

const touched: string[] = [];
function trap(path: string): unknown {
  return new Proxy(function () {}, {
    get: (_t, prop) => (prop === "then" ? undefined : trap(`${path}.${String(prop)}`)),
    apply: () => {
      touched.push(path);
      throw new Error(`DB touched: ${path}`);
    },
  });
}

vi.mock("@/lib/prisma", () => ({ prisma: trap("prisma") }));
vi.mock("@/lib/auth", () => ({
  authOptions: {},
  getServerAuthSession: async () => ({ user: { id: "student-1", email: "student@example.com", role: "STUDENT", name: "Student" } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/admin",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

const modules = import.meta.glob<Record<string, unknown>>("/src/app/**/actions.ts");
const adminFiles = Object.keys(modules).filter((f) => f.includes("/admin/"));

describe("a student is blocked from every admin action", () => {
  it("finds the admin action files", () => {
    expect(adminFiles.length).toBeGreaterThan(8);
  });

  for (const file of adminFiles) {
    it(`${file.replace("/src/app/(dashboard)/", "")}: nothing runs and no data is touched`, async () => {
      const mod = await modules[file]();
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== "function") continue;
        touched.length = 0;
        let outcome: unknown;
        try {
          outcome = await (fn as (...a: unknown[]) => unknown)({}, {}, {});
        } catch (err) {
          outcome = err;
        }
        expect(touched, `${name} touched the database for a student`).toEqual([]);
        const succeeded = typeof outcome === "object" && outcome !== null && !(outcome instanceof Error) && (outcome as { ok?: boolean }).ok === true;
        expect(succeeded, `${name} reported success for a student`).toBe(false);
      }
    });
  }
});

describe("a student is blocked from the admin pages and downloads", () => {
  it("the admin layout sends a student away before it reads anything", async () => {
    touched.length = 0;
    const { default: AdminLayout } = await import("@/app/(dashboard)/admin/layout");
    await expect(AdminLayout({ children: null })).rejects.toThrow("REDIRECT:/dashboard");
    expect(touched).toEqual([]);
  });

  it("the CSV export answers a student with Not found", async () => {
    touched.length = 0;
    const { GET } = await import("@/app/api/admin/export/route");
    const res = await GET(new Request("http://localhost/api/admin/export?type=people"));
    expect(res.status).toBe(404);
    expect(touched).toEqual([]);
  });
});

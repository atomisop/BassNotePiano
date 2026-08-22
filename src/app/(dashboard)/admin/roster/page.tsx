import { getStudentRoster } from "@/lib/admin";
import { StudentRosterTable } from "@/components/admin/StudentRosterTable";

export default async function AdminRosterPage() {
  const students = await getStudentRoster();

  const withAccess = students.filter((s) => s.hasCurriculumAccess).length;
  // "Active" = practised in the last week. Derived from the same
  // lastActivityDate the streak uses, so the two can never disagree.
  const activeThisWeek = students.filter(
    (s) => s.lastActivityAt !== null && Date.now() - s.lastActivityAt < 7 * 86_400_000,
  ).length;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[rgb(var(--c-a-400)/0.8)]">Admin</p>
      <h1 className="mt-1.5 font-serif text-3xl text-slate-50">Student roster</h1>
      <p className="mt-2 text-sm text-slate-500">
        {students.length} student{students.length === 1 ? "" : "s"} · {withAccess} with curriculum
        access · {activeThisWeek} active this week
      </p>

      <div className="glass-surface mt-8 p-5">
        <StudentRosterTable students={students} />
      </div>
    </div>
  );
}

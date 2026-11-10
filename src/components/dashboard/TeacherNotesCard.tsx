import { Card, Eyebrow } from "@/components/ui/Card";
import { listNotesForStudent } from "@/lib/studentNotes";

/** Notes shown before the rest fold away (DESIGN.md, Hierarchy rule 9). */
const FIRST = 3;

/** The notes the teacher chose to share. Private notes are never queried here. Renders nothing when there are none. */
export async function TeacherNotesCard({ studentId }: { studentId: string }) {
  const notes = await listNotesForStudent(studentId);
  if (notes.length === 0) return null;
  const shown = notes.slice(0, 5);
  // The note is what you read; its date is a quiet line under it.
  const note = (n: (typeof shown)[number]) => (
    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
      <p className="whitespace-pre-wrap text-body text-slate-100">{n.body}</p>
      <p className="mt-1 text-caption text-slate-500">
        {new Date(n.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </li>
  );
  const rest = shown.slice(FIRST);
  return (
    <Card>
      <Eyebrow>Notes from your teacher</Eyebrow>
      <ul className="mt-3 divide-y divide-slate-50/8">
        {shown.slice(0, FIRST).map(note)}
        {rest.length > 0 && (
          <li className="pt-3">
            <details className="group/more">
              <summary className="tap inline-flex cursor-pointer list-none items-center text-small font-medium text-slate-400 hover:text-slate-200 group-open/more:hidden [&::-webkit-details-marker]:hidden">
                Show {rest.length} more
              </summary>
              <ul className="divide-y divide-slate-50/8">{rest.map(note)}</ul>
            </details>
          </li>
        )}
      </ul>
    </Card>
  );
}

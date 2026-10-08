import { Card, Eyebrow } from "@/components/ui/Card";
import { listNotesForStudent } from "@/lib/studentNotes";

/** The notes the teacher chose to share. Private notes are never queried here. Renders nothing when there are none. */
export async function TeacherNotesCard({ studentId }: { studentId: string }) {
  const notes = await listNotesForStudent(studentId);
  if (notes.length === 0) return null;
  return (
    <Card>
      <Eyebrow>Notes from your teacher</Eyebrow>
      <ul className="mt-3 space-y-3">
        {notes.slice(0, 5).map((n) => (
          <li key={n.id}>
            <p className="whitespace-pre-wrap text-body text-slate-100">{n.body}</p>
            <p className="mt-1 text-small text-slate-500">
              {new Date(n.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

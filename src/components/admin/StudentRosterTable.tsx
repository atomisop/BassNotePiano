"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { StudentRosterRow } from "@/lib/admin";
import { DataTable } from "@/components/ui/DataTable";
import { CheckIcon } from "@/components/ui/icons";

function relativeDays(ms: number | null): string {
  if (ms === null) return "Never";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function StudentRosterTable({ students }: { students: StudentRosterRow[] }) {
  // Memoised so the table doesn't rebuild its column model on every render —
  // TanStack treats a new `columns` array as a new table definition.
  const columns = React.useMemo<ColumnDef<StudentRosterRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Student",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-100">{row.original.name}</p>
            <p className="truncate text-xs text-slate-500">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "hasCurriculumAccess",
        header: "Access",
        cell: ({ row }) =>
          row.original.hasCurriculumAccess ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              <CheckIcon size={11} />
              Full
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Not purchased</span>
          ),
      },
      {
        accessorKey: "scalesCompleted",
        header: "Scales",
        cell: ({ row }) => (
          <span className="tabular-nums text-slate-200">{row.original.scalesCompleted}/6</span>
        ),
      },
      {
        accessorKey: "currentStreak",
        header: "Streak",
        cell: ({ row }) => (
          <span className="tabular-nums text-slate-200">{row.original.currentStreak}</span>
        ),
      },
      {
        accessorKey: "classCredits",
        header: "Credits",
        cell: ({ row }) => (
          <span className="tabular-nums text-slate-200">{row.original.classCredits}</span>
        ),
      },
      {
        accessorKey: "lastActivityAt",
        header: "Last active",
        // Sorts on the raw timestamp while displaying the relative string —
        // sorting the rendered text would order "Yesterday" before "2d ago"
        // alphabetically, which is nonsense.
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-slate-400">
            {relativeDays(row.original.lastActivityAt)}
          </span>
        ),
        sortUndefined: "last",
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={students}
      searchColumn="name"
      searchPlaceholder="Search students by name…"
      emptyTitle="No students yet"
      emptyDescription="Once someone registers and completes onboarding, they'll show up here with their progress."
      pageSize={15}
    />
  );
}

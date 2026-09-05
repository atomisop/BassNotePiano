"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * #2 — Sortable / filterable / paginated data table.
 *
 * TanStack Table v8 for the logic; every visual is this project's own. Pinned
 * to v8 deliberately: v9 is a rewrite that drops `useReactTable` and the
 * row-model helpers this is built on.
 *
 * Pagination only renders when there is more than one page, so a five-student
 * studio never sees a "Page 1 of 1" control it can't use.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchColumn,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Once there's data to show, it'll appear in this table.",
  pageSize = 10,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  /** Column id to filter against. Omit to hide the search field. */
  searchColumn?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [filter, setFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  React.useEffect(() => {
    if (!searchColumn) return;
    table.getColumn(searchColumn)?.setFilterValue(filter);
  }, [filter, searchColumn, table]);

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div>
      {searchColumn && (
        <div className="mb-3">
          <label htmlFor="datatable-search" className="sr-only">
            {searchPlaceholder}
          </label>
          <input
            id="datatable-search"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full max-w-xs glass-surface-subtle px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[rgb(var(--c-s-50)/0.6)]"
          />
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const dir = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        // aria-sort is what tells a screen reader the table is
                        // sorted and which way — the caret alone is invisible
                        // to it.
                        aria-sort={
                          dir === "asc"
                            ? "ascending"
                            : dir === "desc"
                              ? "descending"
                              : canSort
                                ? "none"
                                : undefined
                        }
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex cursor-pointer items-center gap-1 uppercase tracking-[0.12em] transition-colors hover:text-[rgb(var(--c-s-50))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-s-50)/0.7)]"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortCaret dir={dir === false ? null : dir} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-slate-500">
                    Nothing matches “{filter}”.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {table.getState().pagination.pageIndex + 1} of {pageCount}
              </p>
              <div className="flex gap-2">
                <PageButton
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </PageButton>
                <PageButton onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  Next
                </PageButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[rgb(var(--c-s-50)/0.4)] hover:text-[rgb(var(--c-s-50))] disabled:cursor-default disabled:opacity-40 disabled:hover:border-ink/10 disabled:hover:text-slate-300"
    >
      {children}
    </button>
  );
}

function SortCaret({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
      className={dir ? "text-[rgb(var(--c-s-50))]" : "text-slate-600"}
    >
      {dir === "desc" ? (
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

"use client";

import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataCell, DataTable, DataTableRow } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import type { ReportSection } from "@/lib/domain/report";

export function ReportTable({ section }: { section: ReportSection }) {
  const columns = useMemo(() => section.columns.map((label, index) => ({ key: `column-${index}`, label })), [section.columns]);
  const definitions = useMemo(() => columns.map(({ key }, index) => ({
    id: key, accessorFn: (row: string[]) => row[index],
  })), [columns]);
  // TanStack Table v8 manages local report sections with its own memoized row model.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: section.rows,
    columns: definitions,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 15 } },
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows;
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-base font-semibold">{section.title}</h2>
      <DataTable label={section.title} columns={columns}
        empty={<p className="p-4 text-sm text-muted-foreground">Belum ada catatan pada cakupan ini.</p>}
        pagination={table.getPageCount() > 1 ? <nav aria-label={`Paginasi ${section.title}`} className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted-foreground">Halaman {pageIndex + 1} dari {table.getPageCount()}</span>
          <Button type="button" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Sebelumnya</Button>
          <Button type="button" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Berikutnya</Button>
        </nav> : undefined}>
        {rows.length ? rows.map((row, index) => <DataTableRow key={row.id} number={pageIndex * pageSize + index + 1}>
          {columns.map((column, position) => <DataCell key={column.key} column={column}>{row.original[position]}</DataCell>)}
        </DataTableRow>) : undefined}
      </DataTable>
    </section>
  );
}

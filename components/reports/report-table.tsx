"use client";

import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataCell, DataTable, DataTableRow } from "@/components/shared/data-table";
import { StatusBadge, type StatusPresentation } from "@/components/shared/status-badge";
import { PageLinks } from "@/components/shared/page-links";
import { rawReportSortValue, type ReportSection } from "@/lib/domain/report";
import { compareSortValues, type SortValue, type TableSort } from "@/lib/domain/table-sort";

type ReportRow = { id: string; values: SortValue[]; display: string[]; badges?: (StatusPresentation | null)[] };

export function ReportTable({ section }: { section: ReportSection }) {
  const [sort, setSort] = useState<TableSort>();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 15 });
  const rows = useMemo(() => section.rowMeta.map((meta, index) => ({ id: meta.id, values: meta.values.map(rawReportSortValue), badges: meta.badges, display: section.rows[index] })), [section]);
  const definitions = useMemo(() => section.tableColumns.map(({ key }, index): ColumnDef<ReportRow> => ({
    id: key, accessorFn: (row) => row.values[index],
    sortUndefined: false,
    sortingFn: (left, right, id) => {
      const direction = sort?.direction ?? "asc";
      const result = compareSortValues(left.getValue<SortValue>(id), right.getValue<SortValue>(id), direction);
      // TanStack applies the direction again. Keep missing values last in either direction.
      return direction === "desc" ? -result : result;
    },
  })), [section.tableColumns, sort]);
  // TanStack v8 maintains its own memoized row models.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: definitions,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { pagination, sorting: sort ? [{ id: sort.column, desc: sort.direction === "desc" }] : [] },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
  });
  const pageRows = table.getRowModel().rows;
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-base font-semibold">{section.title}</h2>
      <DataTable label={section.title} columns={section.tableColumns}
        sorting={{ current: sort, onSort: (next) => { setSort(next); table.setPageIndex(0); } }}
        empty={<p className="p-4 text-sm text-muted-foreground">Belum ada catatan pada cakupan ini.</p>}
        pagination={<PageLinks label={section.title} current={pagination.pageIndex + 1} pages={Math.max(1, table.getPageCount())}
          total={rows.length} onPage={(page) => table.setPageIndex(page - 1)} />}>
        {pageRows.length ? pageRows.map((row, index) => <DataTableRow key={row.id} number={pagination.pageIndex * pagination.pageSize + index + 1}>
          {section.tableColumns.map((column, position) => {
            const badge = row.original.badges?.[position];
            return <DataCell key={column.key} column={column}>{badge ? <StatusBadge {...badge} /> : row.original.display[position]}</DataCell>;
          })}
        </DataTableRow>) : undefined}
      </DataTable>
    </section>
  );
}

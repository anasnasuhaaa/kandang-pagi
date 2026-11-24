import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { nextTableSort, sortParams, tableHref, tableParam, tableColumn, type DataColumn, type TableSort } from "@/lib/domain/table-sort";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export { tableColumn, type DataColumn };

export const actionColumn = tableColumn("actions", "Tindakan", "actions");

type Sorting = { current?: TableSort } & (
  { path: string; query: Record<string, string>; scope?: string } | { onSort: (sort?: TableSort) => void }
);

function SortHeader({ column, sorting }: { column: DataColumn; sorting: Sorting }) {
  const direction = sorting.current?.column === column.key ? sorting.current.direction : undefined;
  const next = nextTableSort(column.key, sorting.current);
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  const action = next?.direction === "asc" ? "Urutkan naik" : next?.direction === "desc" ? "Urutkan turun" : "Kembalikan urutan awal";
  const link = "path" in sorting ? tableHref(sorting.path, { ...sorting.query, ...sortParams(next, sorting.scope), [tableParam("halaman", sorting.scope)]: "" }) : undefined;
  return <Button variant="ghost" size="sm" type={link ? undefined : "button"} nativeButton={!link}
    render={link ? <Link href={link} scroll={false} /> : undefined}
    aria-label={`${action}: ${column.label}`}
    className={cn("-mx-2 min-h-11 gap-1 px-2 font-semibold sm:min-h-10", direction && "text-primary")}
    onClick={"onSort" in sorting ? () => sorting.onSort(next) : undefined}>
    {column.label}<Icon className="size-3.5" aria-hidden="true" />
  </Button>;
}

const cellStyles = {
  number: "text-right tabular-nums",
  date: "tabular-nums",
  wrap: "min-w-32 max-w-72 whitespace-normal wrap-anywhere",
  actions: "w-px text-right",
};

export function DataCell({ column, children }: { column: DataColumn; children: ReactNode }) {
  return <TableCell className={column.variant && cellStyles[column.variant]}>{children}</TableCell>;
}

export function DataTableRow({ number, children }: { number: number; children: ReactNode }) {
  return <TableRow>
    <TableCell className="w-px text-right text-muted-foreground tabular-nums">{number}</TableCell>
    {children}
  </TableRow>;
}

export function DataTable({
  label, columns, children, toolbar, pagination, empty, loading = false, sorting,
}: {
  label: string;
  columns: readonly DataColumn[];
  children?: ReactNode;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  sorting?: Sorting;
}) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      {toolbar && <div className="border-b p-3 sm:p-4">{toolbar}</div>}
      <Table aria-label={label} scrollLabel={label} aria-busy={loading} className="text-[0.8125rem]">
        <TableHeader className="bg-muted/45 [&_tr]:hover:bg-transparent">
          <TableRow>
            <TableHead scope="col" className="w-px text-right">#</TableHead>
            {columns.map((column) => (
              <TableHead key={column.key} scope="col" data-column={column.key}
                aria-sort={sorting?.current?.column === column.key ? sorting.current.direction === "asc" ? "ascending" : "descending" : undefined}
                className={cn(column.variant === "number" && "text-right", column.variant === "actions" && "w-px text-right")}>
                {sorting && column.variant !== "actions" ? <SortHeader column={column} sorting={sorting} /> : column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{loading || !children ? <TableRow>
          <TableCell colSpan={columns.length + 1} className="p-0 whitespace-normal">
            {loading ? <Skeleton className="m-4 h-16" /> : <span className="sr-only">Tidak ada hasil</span>}
          </TableCell>
        </TableRow> : children}</TableBody>
      </Table>
      {!loading && !children && empty}
      {pagination && <div className="border-t p-3 sm:p-4">{pagination}</div>}
    </Card>
  );
}

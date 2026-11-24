import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataColumn = {
  key: string;
  label: string;
  variant?: "number" | "date" | "wrap" | "actions";
};

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
  label, columns, children, toolbar, pagination, empty, loading = false,
}: {
  label: string;
  columns: readonly DataColumn[];
  children?: ReactNode;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      {toolbar && <div className="border-b p-3 sm:p-4">{toolbar}</div>}
      <Table aria-label={label} scrollLabel={label} aria-busy={loading} className="text-[0.8125rem]">
        <TableHeader className="bg-muted/45 [&_tr]:hover:bg-transparent">
          <TableRow>
            <TableHead scope="col" className="w-px text-right">#</TableHead>
            {columns.map(({ key, label, variant }) => (
              <TableHead key={key} scope="col" className={cn(
                variant === "number" && "text-right", variant === "actions" && "w-px text-right",
              )}>{label}</TableHead>
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

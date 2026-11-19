import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DataTable({
  label, columns, children, toolbar, pagination, empty,
}: {
  label: string;
  columns: readonly { label: string; key: string; className?: string }[];
  children?: ReactNode;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <Card className="min-w-0 overflow-hidden py-0">
      {toolbar && <div className="border-b p-3 sm:p-4">{toolbar}</div>}
      {children ? (
        <div tabIndex={0} role="region" aria-label={label} className="min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
          <Table aria-label={label}>
            <TableHeader>
              <TableRow>
                {columns.map(({ key, label, className }) => (
                  <TableHead key={key} scope="col" className={className}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{children}</TableBody>
          </Table>
        </div>
      ) : empty}
      {pagination && <div className="border-t p-3 sm:p-4">{pagination}</div>}
    </Card>
  );
}

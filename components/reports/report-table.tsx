"use client";

import { useState } from "react";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ReportSection } from "@/lib/domain/report";

export function ReportTable({ section }: { section: ReportSection }) {
  const [page, setPage] = useState(1);
  const size = 15;
  const pages = Math.max(1, Math.ceil(section.rows.length / size));
  const first = (page - 1) * size;
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{section.title}</h2>
      <DataTable label={section.title} columns={section.columns.map((label) => ({ key: label, label }))}
        empty={<p className="p-4 text-sm text-muted-foreground">Belum ada catatan pada cakupan ini.</p>}
        pagination={pages > 1 ? <nav aria-label={`Paginasi ${section.title}`} className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted-foreground">Halaman {page} dari {pages}</span>
          <Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
          <Button type="button" variant="outline" disabled={page === pages} onClick={() => setPage(page + 1)}>Berikutnya</Button>
        </nav> : undefined}>
        {section.rows.length ? section.rows.slice(first, first + size).map((row, index) => <TableRow key={first + index}>
          {row.map((text, column) => <TableCell key={section.columns[column]} className="max-w-60 whitespace-normal">{text}</TableCell>)}
        </TableRow>) : undefined}
      </DataTable>
    </section>
  );
}

import type { ReactNode } from "react";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/module";
import { PageLinks } from "@/components/shared/page-links";
import { TableCell, TableRow } from "@/components/ui/table";
import { LedgerFilters } from "./ledger-filters";

export type LedgerRow = { id: string; cells: ReactNode[]; search: string; filter?: string };

export function LedgerTable({
  path, label, tab, rows, columnLabels, query, choices = [],
}: {
  path: string; label: string; tab: string; rows: LedgerRow[]; columnLabels: string[];
  query: { from: string; to: string; search: string; page: number; filter: string };
  choices?: { value: string; label: string }[];
}) {
  const pageSize = 12;
  const needle = query.search.toLocaleLowerCase("id-ID");
  const matching = rows.filter((row) => row.search.toLocaleLowerCase("id-ID").includes(needle)
    && (!query.filter || row.filter?.split(",").includes(query.filter)));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const current = Math.min(query.page, pages);
  const start = (current - 1) * pageSize;
  return (
    <DataTable label={label} columns={columnLabels.map((name) => ({ key: name, label: name }))}
      toolbar={<LedgerFilters key={`${tab}:${query.from}:${query.to}:${query.search}:${query.filter}`} path={path} tab={tab} query={query} choices={choices} />}
      empty={<EmptyState title="Belum ada catatan" description="Catatan yang sesuai dengan periode dan pencarian akan tampil di sini." />}
      pagination={<PageLinks path={path} current={current} pages={pages}
        query={{ tab, mulai: query.from, akhir: query.to, cari: query.search, filter: query.filter }} />}>
      {matching.length ? matching.slice(start, start + pageSize).map((row) => (
        <TableRow key={row.id}>
          {row.cells.map((cell, index) => (
            <TableCell key={columnLabels[index]} className={index === 0 ? "font-medium" : "max-w-60 whitespace-normal"}>{cell}</TableCell>
          ))}
        </TableRow>
      )) : undefined}
    </DataTable>
  );
}

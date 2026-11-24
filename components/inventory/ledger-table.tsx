import type { ReactNode } from "react";
import { DataTable, DataTableRow } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/module";
import { PageLinks } from "@/components/shared/page-links";
import { TableCell } from "@/components/ui/table";
import { LedgerFilters, type LedgerKindFilter } from "./ledger-filters";

export type LedgerRow = { id: string; cells: ReactNode[]; search: string; filter?: string };

export function LedgerTable({
  path, label, tab, rows, columnLabels, query, choices = [], filterLabel, kind, showPeriod = true, empty,
}: {
  path: string; label: string; tab: string; rows: LedgerRow[]; columnLabels: string[];
  query: { from: string; to: string; search: string; page: number; filter: string };
  choices?: { value: string; label: string }[];
  filterLabel?: string;
  kind?: LedgerKindFilter;
  showPeriod?: boolean;
  empty?: ReactNode;
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
      toolbar={<LedgerFilters key={`${tab}:${query.from}:${query.to}:${query.search}:${query.filter}:${kind?.value ?? ""}`}
        path={path} tab={tab} query={query} choices={choices} filterLabel={filterLabel} kind={kind} showPeriod={showPeriod} />}
      empty={empty ?? <EmptyState title="Belum ada catatan" description={showPeriod
        ? "Catatan yang sesuai dengan periode dan pencarian akan tampil di sini."
        : "Catatan yang sesuai dengan pencarian dan filter akan tampil di sini."} />}
      pagination={<PageLinks path={path} current={current} pages={pages}
        query={{ tab, ...(showPeriod ? { mulai: query.from, akhir: query.to } : {}),
          cari: query.search, filter: query.filter, ...(kind?.value ? { jenis: kind.value } : {}) }} />}>
      {matching.length ? matching.slice(start, start + pageSize).map((row, index) => (
        <DataTableRow key={row.id} number={start + index + 1}>
          {row.cells.map((cell, index) => (
            <TableCell key={columnLabels[index]} className={index === 0 ? "font-medium" : "max-w-60 whitespace-normal"}>{cell}</TableCell>
          ))}
        </DataTableRow>
      )) : undefined}
    </DataTable>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { actionColumn, DataCell, DataTable, DataTableRow, type DataColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/module";
import { StatusBadge, type StatusPresentation } from "@/components/shared/status-badge";
import { PageLinks } from "@/components/shared/page-links";
import { scopeTableParams, sortParams, sortTableRows, type SortValue, type TableSort } from "@/lib/domain/table-sort";
import { LedgerFilters, type LedgerKindFilter } from "./ledger-filters";

export type LedgerCell = string | { value: SortValue; content: ReactNode };
export type LedgerRow = { id: string; cells: LedgerCell[]; search: string; filter?: string; actions?: ReactNode };

export function ledgerCell(value: SortValue, content: ReactNode): LedgerCell {
  return { value, content };
}

export function ledgerBadge(presentation: StatusPresentation, icon?: LucideIcon): LedgerCell {
  return ledgerCell(presentation.label, <StatusBadge {...presentation} icon={icon} />);
}

export function LedgerTable({
  path, label, tab, rows, columns, query, choices = [], filterLabel, kind, showPeriod = true, empty, showFilters = true, scope, preserve = {},
}: {
  path: string; label: string; tab: string; rows: LedgerRow[]; columns: DataColumn[];
  query: { from: string; to: string; search: string; page: number; filter: string; sort?: TableSort };
  choices?: { value: string; label: string }[];
  filterLabel?: string;
  kind?: LedgerKindFilter;
  showPeriod?: boolean;
  showFilters?: boolean;
  scope?: string;
  preserve?: Record<string, string>;
  empty?: ReactNode;
}) {
  const pageSize = 12;
  const needle = query.search.toLocaleLowerCase("id-ID");
  const matching = rows.filter((row) => row.search.toLocaleLowerCase("id-ID").includes(needle)
    && (!query.filter || row.filter?.split(",").includes(query.filter)));
  const columnIndex = columns.findIndex(({ key }) => key === query.sort?.column);
  const sort = columnIndex >= 0 ? query.sort : undefined;
  const ordered = sort ? sortTableRows(matching, sort.direction, ({ cells }) => {
    const cell = cells[columnIndex];
    return typeof cell === "string" ? cell : cell.value;
  }) : matching;
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const current = Math.min(query.page, pages);
  const start = (current - 1) * pageSize;
  const pageRows = ordered.slice(start, start + pageSize);
  const hasActions = pageRows.some(({ actions }) => Boolean(actions));
  const filters = { ...(showPeriod ? { mulai: query.from, akhir: query.to } : {}),
    cari: query.search, filter: query.filter, ...(kind?.value ? { jenis: kind.value } : {}) };
  const params = { ...preserve, ...(showFilters ? scopeTableParams(filters, scope) : {}), tab };
  return (
    <DataTable label={label} columns={hasActions ? [...columns, actionColumn] : columns}
      sorting={{ current: sort, path, query: params, scope }}
      toolbar={showFilters && <LedgerFilters key={JSON.stringify(filters)}
        path={path} tab={tab} query={{ ...query, sort }} choices={choices} filterLabel={filterLabel} kind={kind} showPeriod={showPeriod} scope={scope} preserve={preserve} />}
      empty={empty ?? <EmptyState title="Belum ada catatan" description={showPeriod
        ? "Catatan yang sesuai dengan periode dan pencarian akan tampil di sini."
        : "Catatan yang sesuai dengan pencarian dan filter akan tampil di sini."} />}
      pagination={<PageLinks path={path} current={current} pages={pages} total={ordered.length} scope={scope}
        query={{ ...params, ...sortParams(sort, scope) }} />}>
      {pageRows.length ? pageRows.map((row, index) => (
        <DataTableRow key={row.id} number={start + index + 1}>
          {row.cells.map((cell, index) => (
            <DataCell key={columns[index].key} column={columns[index]}>{typeof cell === "string" ? cell : cell.content}</DataCell>
          ))}
          {hasActions && <DataCell column={actionColumn}>{row.actions}</DataCell>}
        </DataTableRow>
      )) : undefined}
    </DataTable>
  );
}

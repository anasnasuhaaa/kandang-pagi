import { RowActions } from "@/components/shared/row-actions";
import type { Metadata } from "next";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bird, CircleMinus, House, Minus, PackageOpen, Users } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { PopulationFilters } from "@/components/population/filters";
import { BarnForm, BarnStatusAction, CancelMovementAction, FlockForm, MovementForm } from "@/components/population/forms";
import { actionColumn, DataTable, DataTableRow, tableColumn as col } from "@/components/shared/data-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { PageLinks } from "@/components/shared/page-links";
import { SemanticIndicator, StatusBadge, statusPresentation } from "@/components/shared/status-badge";
import { TableCell } from "@/components/ui/table";
import { readTableSort, sortParams } from "@/lib/domain/table-sort";
import { activeStatus, flockPlacementStatus, movementPresentation, recordStatus } from "@/lib/status-presentation";
import { populationPeriod } from "@/lib/domain/population-input";
import { businessDate, businessTimeZone, formatDate, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { populationPage } from "@/server/services/population";

export const metadata: Metadata = { title: "Populasi Ternak" };
const path = "/populasi";
const tabs = [
  { value: "kandang", label: "Kandang" }, { value: "kelompok", label: "Kelompok ternak" },
  { value: "mutasi", label: "Mutasi" }, { value: "riwayat", label: "Riwayat" },
];
const querySchema = z.object({
  tab: z.enum(["kandang", "kelompok", "mutasi", "riwayat"]).catch("kandang"),
  cari: z.string().trim().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});
const movementIcons = {
  opening: PackageOpen, arrival: ArrowDownLeft, death: CircleMinus, cull: Minus, exit: ArrowUpRight, transfer: ArrowRight,
} as const;
const recorded = new Intl.DateTimeFormat("id-ID", { timeZone: businessTimeZone, dateStyle: "short", timeStyle: "short" });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type View = Awaited<ReturnType<typeof populationPage>>;

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><PopulationContent {...props} /></Suspense>;
}

async function PopulationContent({ searchParams }: Props) {
  const actor = await requireModule("populasi");
  const raw = await searchParams;
  const { tab, cari, halaman } = querySchema.parse(raw);
  const period = populationPeriod(raw, 30);
  const movementColumns = [
    col("date", "Tanggal mutasi", "date"), col("flock", "Kelompok", "wrap"), col("kind", "Jenis"),
    col("count", "Jumlah", "number"), col("source", "Dari"), col("target", "Ke"), col("note", "Alasan", "wrap"),
  ];
  const columns = tab === "kandang" ? [col("code", "Kode"), col("name", "Nama", "wrap"), col("location", "Lokasi", "wrap"), col("status", "Status")] :
    tab === "kelompok" ? [col("name", "Kelompok", "wrap"), col("barn", "Kandang"), col("alive", "Hidup", "number"),
      col("initial", "Jumlah awal", "number"), col("placed", "Penempatan", "date"), col("age", "Umur awal", "number"),
      col("origin", "Asal", "wrap"), col("status", "Status")] :
      tab === "mutasi" ? movementColumns : [...movementColumns, col("actor", "Dicatat oleh", "wrap"), col("recorded", "Waktu (WIB)", "date"), col("status", "Status")];
  const requested = readTableSort(raw);
  const sort = columns.some(({ key }) => key === requested?.column) ? requested : undefined;
  const query = { tab, cari, mulai: period.from, akhir: period.to, kandang: period.barnId ?? "", kelompok: period.flockId ?? "" };
  const data = await populationPage(await headers(), { date: period.to, from: period.from, barnId: period.barnId, flockId: period.flockId, search: cari, page: halaman, tab, sort });
  const date = data.snapshot.timeline[0];
  const admin = actor.role === "administrator";
  const operator = admin || actor.role === "abk";
  const today = businessDate();
  const barnChoices = data.barnOptions.map(({ id, name, code }) => ({ value: id, label: `${code} · ${name}` }));
  const activeBarns = barnChoices.filter((option) => data.barnOptions.some((barn) => barn.id === option.value && barn.active));
  const flockChoices = data.flockOptions.map(({ id, name, code }) => ({ value: id, label: `${code} · ${name}` }));
  const action = tab === "kandang" && admin ? <BarnForm /> :
    tab === "kelompok" && operator && activeBarns.length ? <FlockForm barns={activeBarns} today={today} /> :
    tab === "mutasi" && operator && flockChoices.length ? <MovementForm barns={activeBarns} flocks={flockChoices} today={today} /> : null;

  const hasActions = admin && (tab === "kandang" ? data.barns.length > 0 : tab === "riwayat" && data.history.some(canCancel));
  const rows = tab === "kandang" ? renderBarns(data, hasActions) : tab === "kelompok" ? renderFlocks(data) : renderMoves(data, tab === "riwayat", hasActions);
  const title = tabs.find((item) => item.value === tab)!.label;

  return (
    <>
      <ModuleHeader title="Populasi Ternak" description="Pantau penempatan ternak dan perubahan jumlah per tanggal operasional." icon={House} action={action} />
      <section aria-label="Ringkasan populasi" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Bird} label="Ternak hidup" value={date.known ? `${formatQuantity(date.hens)} ekor` : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard icon={Users} label="Kelompok aktif" value={date.known ? formatQuantity(date.activeFlocks) : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard icon={CircleMinus} label="Kematian tercatat" value={date.known ? `${formatQuantity(date.deaths)} ekor` : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard icon={House} label="Kandang aktif saat ini" value={formatQuantity(data.barnOptions.filter(({ active }) => active).length)} />
      </section>
      <ModuleTabs path={path} tab={tab} tabs={tabs}>
        <DataTable label={title} columns={hasActions ? [...columns, actionColumn] : columns} sorting={{ path, query, current: sort }}
          toolbar={<PopulationFilters key={String(raw.tab) + "-" + period.from + period.to + (period.barnId ?? "") + (period.flockId ?? "") + cari}
            path={path} tab={tab} from={period.from} to={period.to} search={cari} barnId={period.barnId} flockId={period.flockId} barns={barnChoices} flocks={flockChoices} today={today} sort={sort} />}
          empty={<EmptyState title="Belum ada catatan" description={
            tab === "kelompok" && !activeBarns.length ? "Diperlukan kandang aktif sebelum mencatat kelompok." : "Catatan yang sesuai dengan pencarian dan filter akan muncul di sini."
          } />}
          pagination={<PageLinks path={path} current={data.current} pages={data.pages} total={data.total} query={{ ...query, ...sortParams(sort) }} />}>
          {rows.length ? rows : undefined}
        </DataTable>
      </ModuleTabs>
    </>
  );
}

function renderBarns(data: View, admin: boolean) {
  return data.barns.map((barn, index) => (
    <DataTableRow key={barn.id} number={(data.current - 1) * data.pageSize + index + 1}>
      <TableCell className="font-medium">{barn.code}</TableCell>
      <TableCell className="min-w-32 max-w-64 whitespace-normal wrap-anywhere">{barn.name}</TableCell><TableCell className="min-w-28 max-w-56 whitespace-normal wrap-anywhere">{barn.location || "—"}</TableCell>
      <TableCell><StatusBadge {...activeStatus(barn.active)} /></TableCell>
      {admin && <TableCell className="w-px text-right"><RowActions actions={[{ id: "status", label: barn.active ? "Nonaktifkan" : "Aktifkan kembali",
        icon: barn.active ? "cancel" : "check", destructive: barn.active, content: <BarnStatusAction barnId={barn.id} name={barn.name} active={barn.active} /> }]} /></TableCell>}
    </DataTableRow>
  ));
}

function renderFlocks(data: View) {
  return data.flocks.map((flock, index) => {
    const position = data.snapshot.placements.get(flock.id);
    const barn = data.barnOptions.find((item) => item.id === position?.barnId);
    return (
      <DataTableRow key={flock.id} number={(data.current - 1) * data.pageSize + index + 1}>
        <TableCell className="min-w-32 max-w-64 whitespace-normal wrap-anywhere"><span className="font-medium">{flock.name}</span><span className="block text-xs text-muted-foreground">{flock.code}</span></TableCell>
        <TableCell>{barn?.name ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{position ? formatQuantity(position.alive) : "—"}</TableCell>
        <TableCell className="text-right tabular-nums">{formatQuantity(flock.initialHenHoused)}</TableCell><TableCell>{formatDate(flock.placedOn)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatQuantity(flock.initialAgeDays)} hari</TableCell><TableCell className="min-w-28 max-w-56 whitespace-normal wrap-anywhere">{flock.origin}</TableCell>
        <TableCell><StatusBadge label={flockPlacementStatus(position?.alive)} tone={position?.alive ? "success" : position ? "neutral" : "warning"} /></TableCell>
      </DataTableRow>
    );
  });
}

function canCancel(move: View["history"][number]) {
  return !move.reversal && move.kind !== "opening" && move.kind !== "arrival";
}

function renderMoves(data: View, audit: boolean, admin: boolean) {
  return data.history.map((move, index) => (
    <DataTableRow key={move.id} number={(data.current - 1) * data.pageSize + index + 1}>
      <TableCell className="font-medium">{formatDate(move.day)}</TableCell>
      <TableCell>{move.flock}</TableCell><TableCell><SemanticIndicator {...statusPresentation(movementPresentation, move.kind)} icon={movementIcons[move.kind]} /></TableCell><TableCell className="text-right tabular-nums">{formatQuantity(move.count)} ekor</TableCell>
      <TableCell>{move.from ?? "—"}</TableCell><TableCell>{move.to ?? "—"}</TableCell><TableCell className="min-w-32 max-w-xs whitespace-normal wrap-anywhere">{move.note}</TableCell>
      {audit && <>
        <TableCell>{move.actor}</TableCell><TableCell>{recorded.format(move.recordedAt)}</TableCell>
        <TableCell><StatusBadge {...recordStatus(!move.reversal)} />
          {move.reversalReason && <span className="mt-1 block max-w-48 whitespace-normal text-xs text-muted-foreground">{move.reversalReason}</span>}
        </TableCell>
        {admin && <TableCell className="w-px text-right">{canCancel(move)
          ? <RowActions actions={[{ id: "cancel", label: "Batalkan mutasi", icon: "cancel", destructive: true, content: <CancelMovementAction eventId={move.id} /> }]} /> : null}</TableCell>}
      </>}
    </DataTableRow>
  ));
}

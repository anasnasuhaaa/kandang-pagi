import type { Metadata } from "next";
import { House } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { PopulationFilters } from "@/components/population/filters";
import { BarnForm, BarnStatusAction, CancelMovementAction, FlockForm, MovementForm } from "@/components/population/forms";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { PageLinks } from "@/components/shared/page-links";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { movementLabels, populationPeriod } from "@/lib/domain/population-input";
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
  const data = await populationPage(await headers(), { date: period.to, from: period.from, barnId: period.barnId, flockId: period.flockId, search: cari, page: halaman, tab });
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

  const headersByTab = {
    kandang: admin ? ["Kode", "Nama", "Lokasi", "Status", "Tindakan"] : ["Kode", "Nama", "Lokasi", "Status"],
    kelompok: ["Kelompok", "Kandang", "Hidup", "Jumlah awal", "Penempatan", "Umur awal", "Asal", "Status"],
    mutasi: ["Tanggal mutasi", "Kelompok", "Jenis", "Jumlah", "Dari", "Ke", "Alasan"],
    riwayat: ["Tanggal mutasi", "Kelompok", "Jenis", "Jumlah", "Dari", "Ke", "Alasan", "Dicatat oleh", "Waktu (WIB)", "Status", ...(admin ? ["Tindakan"] : [])],
  };
  const rows = tab === "kandang" ? renderBarns(data, admin) : tab === "kelompok" ? renderFlocks(data) : renderMoves(data, tab === "riwayat", admin);
  const title = tabs.find((item) => item.value === tab)!.label;

  return (
    <>
      <ModuleHeader title="Populasi Ternak" description="Pantau penempatan ternak dan perubahan jumlah per tanggal operasional." icon={House} action={action} />
      <section aria-label="Ringkasan populasi" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ternak hidup" value={date.known ? `${formatQuantity(date.hens)} ekor` : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard label="Kelompok aktif" value={date.known ? formatQuantity(date.activeFlocks) : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard label="Kematian tercatat" value={date.known ? `${formatQuantity(date.deaths)} ekor` : "Belum ada data"} detail={formatDate(date.day)} />
        <MetricCard label="Kandang aktif saat ini" value={formatQuantity(data.barnOptions.filter(({ active }) => active).length)} />
      </section>
      <ModuleTabs path={path} tab={tab} tabs={tabs}>
        <DataTable label={title} columns={headersByTab[tab].map((label) => ({ label, key: label }))}
          toolbar={<PopulationFilters key={String(raw.tab) + "-" + period.from + period.to + (period.barnId ?? "") + (period.flockId ?? "") + cari}
            path={path} tab={tab} from={period.from} to={period.to} search={cari} barnId={period.barnId} flockId={period.flockId} barns={barnChoices} flocks={flockChoices} today={today} />}
          empty={<EmptyState title="Belum ada catatan" description={
            tab === "kelompok" && !activeBarns.length ? "Diperlukan kandang aktif sebelum mencatat kelompok." : "Catatan yang sesuai dengan pencarian dan filter akan muncul di sini."
          } />}
          pagination={<PageLinks path={path} current={data.current} pages={data.pages} query={{
            tab, cari, mulai: period.from, akhir: period.to, kandang: period.barnId ?? "", kelompok: period.flockId ?? "",
          }} />}>
          {rows.length ? rows : undefined}
        </DataTable>
      </ModuleTabs>
    </>
  );
}

function renderBarns(data: View, admin: boolean) {
  return data.barns.map((barn) => (
    <TableRow key={barn.id}>
      <TableCell className="font-medium">{barn.code}</TableCell>
      <TableCell>{barn.name}</TableCell><TableCell>{barn.location || "—"}</TableCell>
      <TableCell><Badge variant={barn.active ? "secondary" : "outline"}>{barn.active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
      {admin && <TableCell><BarnStatusAction barnId={barn.id} name={barn.name} active={barn.active} /></TableCell>}
    </TableRow>
  ));
}

function renderFlocks(data: View) {
  return data.flocks.map((flock) => {
    const position = data.snapshot.placements.get(flock.id);
    const barn = data.barnOptions.find((item) => item.id === position?.barnId);
    return (
      <TableRow key={flock.id}>
        <TableCell><span className="font-medium">{flock.name}</span><span className="ml-2 text-muted-foreground">{flock.code}</span></TableCell>
        <TableCell>{barn?.name ?? "—"}</TableCell><TableCell>{position ? formatQuantity(position.alive) : "—"}</TableCell>
        <TableCell>{formatQuantity(flock.initialHenHoused)}</TableCell><TableCell>{formatDate(flock.placedOn)}</TableCell>
        <TableCell>{formatQuantity(flock.initialAgeDays)} hari</TableCell><TableCell>{flock.origin}</TableCell>
        <TableCell><Badge variant={position?.alive ? "secondary" : "outline"}>{position ? position.alive ? "Aktif" : "Selesai" : "Belum ditempatkan"}</Badge></TableCell>
      </TableRow>
    );
  });
}

function renderMoves(data: View, audit: boolean, admin: boolean) {
  return data.history.map((move) => (
    <TableRow key={move.id}>
      <TableCell className="font-medium">{formatDate(move.day)}</TableCell>
      <TableCell>{move.flock}</TableCell><TableCell>{movementLabels[move.kind]}</TableCell><TableCell>{formatQuantity(move.count)} ekor</TableCell>
      <TableCell>{move.from ?? "—"}</TableCell><TableCell>{move.to ?? "—"}</TableCell><TableCell className="max-w-xs whitespace-normal">{move.note}</TableCell>
      {audit && <>
        <TableCell>{move.actor}</TableCell><TableCell>{recorded.format(move.recordedAt)}</TableCell>
        <TableCell><Badge variant={move.reversal ? "outline" : "secondary"}>{move.reversal ? "Dibatalkan" : "Tercatat"}</Badge>
          {move.reversalReason && <span className="mt-1 block max-w-48 whitespace-normal text-xs text-muted-foreground">{move.reversalReason}</span>}
        </TableCell>
        {admin && <TableCell>{!move.reversal && move.kind !== "opening" && move.kind !== "arrival"
          ? <CancelMovementAction eventId={move.id} /> : "—"}</TableCell>}
      </>}
    </TableRow>
  ));
}

import { tableColumn as col, type DataColumn } from "@/components/shared/data-table";
import type { Metadata } from "next";
import { ArrowDownToLine, Boxes, Egg, ListFilter, Scale, ShoppingBasket, SlidersHorizontal } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { EggAdjustmentForm, GradeForm, HarvestForm, SaleForm } from "@/components/inventory/entry-forms";
import { LedgerTable, ledgerBadge, ledgerCell, type LedgerCell, type LedgerRow } from "@/components/inventory/ledger-table";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { SemanticIndicator, StatusBadge, statusPresentation } from "@/components/shared/status-badge";
import { eggPresentation, recordStatus } from "@/lib/status-presentation";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { categoryLabels, sortedCategories, type Category } from "@/lib/domain/production-input";
import { businessDate, formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { eggView } from "@/server/services/eggs";

export const metadata: Metadata = { title: "Produksi Telur" };
const path = "/produksi-telur";
const tabs = [
  { value: "panen", label: "Panen" }, { value: "sortir", label: "Sortir" }, { value: "stok", label: "Stok telur" },
  { value: "penjualan", label: "Penjualan" }, { value: "riwayat", label: "Riwayat" },
];
const tabSchema = z.enum(["panen", "sortir", "stok", "penjualan", "riwayat"]).catch("panen");
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type View = Awaited<ReturnType<typeof eggView>>;
type Tab = z.infer<typeof tabSchema>;
const pieces = (value: number) => `${formatQuantity(value)} butir`;
const categories: Category[] = ["ungraded", ...sortedCategories];
const eventPresentation = {
  egg_harvest: { label: "Panen", icon: Egg, tone: "info" },
  egg_grading: { label: "Sortir", icon: ListFilter, tone: "info" },
  egg_sale: { label: "Penjualan lunas", icon: ShoppingBasket, tone: "success" },
  egg_adjustment: { label: "Pergerakan stok", icon: SlidersHorizontal, tone: "adjustment" },
} as const;
const unknownEvent = { label: "Pergerakan telur", icon: ArrowDownToLine, tone: "neutral" } as const;

function EggBreakdown({ entries }: { entries: { category: Category; pieces: number }[] }) {
  return <ul className="space-y-1">{entries.map(({ category, pieces: count }) =>
    <li key={category} className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
      <StatusBadge {...statusPresentation(eggPresentation, category)} /> {pieces(count)}
    </li>
  )}</ul>;
}

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><EggContent {...props} /></Suspense>;
}

async function EggContent({ searchParams }: Props) {
  const actor = await requireModule("produksi-telur");
  const raw = await searchParams;
  const tab = tabSchema.parse(raw.tab);
  const query = ledgerQuery(raw);
  const data = await eggView(await headers(), query);
  const administrator = actor.role === "administrator";
  const operator = administrator || actor.role === "abk";
  const today = businessDate();
  const barns = data.barns.filter(({ active }) => active).map(({ id, name }) => ({ value: id, label: name }));
  const flocks = data.flocks.map(({ id, name, code }) => ({ value: id, label: `${code} · ${name}` }));
  const lots = data.harvests.filter((harvest) => (data.stock.lots.get(harvest.id) ?? 0) > 0).map((harvest) => ({
    value: harvest.id,
    label: `${formatDate(harvest.day)} · ${data.barns.find(({ id }) => id === harvest.barnId)?.name} · ${pieces(data.stock.lots.get(harvest.id) ?? 0)}`,
  }));
  const saleCategories = sortedCategories.map((value) => ({ value, label: `${categoryLabels[value]} · ${pieces(data.stock.balances[value])}` }));
  const action = tab === "panen" && operator && barns.length ? <HarvestForm today={today} barns={barns} flocks={flocks} /> :
    tab === "sortir" && operator && lots.length ? <GradeForm today={today} lots={lots} /> :
    tab === "penjualan" && administrator ? <SaleForm today={today} categories={saleCategories} /> :
    tab === "stok" && operator ? <EggAdjustmentForm today={today} lots={lots} administrator={administrator} /> : null;
  const inPeriod = data.harvests.filter(({ current, day }) => current && day >= query.from);
  const measured = inPeriod.length && inPeriod.every(({ grams, incomplete }) => grams !== null && !incomplete);
  const { rows, columns } = eggRows(data, tab, actor.role !== "abk");
  const title = tabs.find((item) => item.value === tab)!.label;
  const selected = tab === "panen" ? data.barns.map(({ id, name }) => ({ value: id, label: name })) :
    categories.map((value) => ({ value, label: categoryLabels[value] }));

  return <>
    <ModuleHeader title="Produksi Telur" description="Catat panen aktual, sortir per lot, stok kategori dan penjualan lunas." icon={Egg} />
    <ModuleTabs path={path} tab={tab} tabs={tabs} action={action} summary={
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan produksi telur">
        <MetricCard icon={Egg} label="Panen tercatat" value={inPeriod.length ? pieces(inPeriod.reduce((sum, row) => sum + row.pieces, 0)) : "Data belum lengkap"} detail="Seluruh telur termasuk Cacat" />
        <MetricCard icon={Scale} label="Berat panen terukur" value={measured ? `${formatQuantity(inPeriod.reduce((sum, row) => sum + (row.grams ?? 0), 0) / 1000)} kg` : "Data belum lengkap"} detail="Dalam periode terpilih" />
        <MetricCard icon={ListFilter} label="Belum Disortir" value={pieces(data.stock.balances.ungraded)} detail={formatDate(query.to)} />
        <MetricCard icon={Boxes} label="Stok sudah disortir" value={pieces(sortedCategories.reduce((sum, category) => sum + data.stock.balances[category], 0))} detail={sortedCategories.map((category) => `${categoryLabels[category]} ${formatQuantity(data.stock.balances[category])}`).join(" · ")} />
      </section>
    }>
      <LedgerTable path={path} tab={tab} label={title} rows={rows} columns={columns} query={query} choices={selected} />
    </ModuleTabs>
  </>;
}

function eggRows(data: View, tab: Tab, money: boolean): { columns: DataColumn[]; rows: LedgerRow[] } {
  const barn = (id: string) => data.barns.find((row) => row.id === id)?.name ?? "—";
  const flock = (id: string | null) => id ? data.flocks.find((row) => row.id === id)?.name ?? "—" : "Panen campuran";
  if (tab === "stok") return {
    columns: [col("category", "Kategori"), col("stock", "Stok tersedia", "number")],
    rows: categories.map((category) => ({ id: category, filter: category, search: categoryLabels[category], cells: [ledgerBadge(statusPresentation(eggPresentation, category)), ledgerCell(data.stock.balances[category], pieces(data.stock.balances[category]))] })),
  };
  const kind = tab === "panen" ? "egg_harvest" : tab === "sortir" ? "egg_grading" : tab === "penjualan" ? "egg_sale" : null;
  const rows = data.events.filter((event) => !kind || event.kind === kind).flatMap((event): LedgerRow[] => {
    const harvest = event.harvest;
    const grade = event.grading;
    const sale = event.sale;
    if ((tab === "panen" && !harvest) || (tab === "sortir" && !grade) || (tab === "penjualan" && !sale)) return [];
    const detail = event.moves.map((item) => `${categoryLabels[item.category]} ${pieces(item.deltaPieces)}`).join(" · ");
    const fullStatus = ledgerBadge(recordStatus(Boolean(event.effective)));
    let content: LedgerCell[];
    let search: string[];
    let filter = event.moves.map(({ category }) => category).join(",");
    if (tab === "panen" && harvest) {
      const grams = harvest.incomplete ? null : harvest.grams;
      search = [barn(harvest.barnId), flock(harvest.flockId), pieces(harvest.pieces), grams === null ? "Data belum lengkap" : `${formatQuantity(grams / 1000)} kg`];
      filter = harvest.barnId;
      content = [
        search[0], search[1], ledgerCell(harvest.pieces, search[2]), ledgerCell(grams, search[3]),
      ];
    } else if (tab === "sortir" && grade) {
      const source = data.harvests.find(({ id }) => id === grade.harvestId);
      search = [source ? `${formatDate(source.day)} · ${barn(source.barnId)}` : "—", pieces(grade.brown), pieces(grade.white), pieces(grade.defective)];
      content = [ledgerCell(source?.day, search[0]), ledgerCell(grade.brown, search[1]), ledgerCell(grade.white, search[2]), ledgerCell(grade.defective, search[3])];
    } else if (tab === "penjualan" && sale) {
      const lines = event.lines.map((line) => `${categoryLabels[line.category]} ${pieces(line.pieces)}`).join(" · ");
      const paid = typeof sale.paid === "bigint" ? formatIDR(sale.paid) : "—";
      search = [lines, ...(money ? [sale.buyer || "—", paid] : [])];
      content = [ledgerCell(event.lines.reduce((sum, line) => sum + line.pieces, 0), <EggBreakdown entries={event.lines} />),
        ...(money ? [ledgerCell(sale.buyer || null, sale.buyer || "—"), ledgerCell(sale.paid, paid)] : [])];
    } else {
      const movement = eventPresentation[event.kind as keyof typeof eventPresentation] ?? unknownEvent;
      search = [movement.label, detail || "—"];
      content = [ledgerCell(movement.label, <SemanticIndicator {...movement} tone={event.effective ? movement.tone : "neutral"} />),
        ledgerCell(event.moves.length ? event.moves.reduce((sum, item) => sum + item.deltaPieces, 0) : null, search[1])];
    }
    return [{
      id: event.id, filter, search: [formatDate(event.day), ...search, event.note].join(" "),
      cells: [ledgerCell(event.day, formatDate(event.day)), ...content, ledgerCell(event.note || null, event.note || "—"), fullStatus],
    }];
  });
  const details = tab === "panen" ? [col("barn", "Kandang", "wrap"), col("flock", "Asal panen", "wrap"), col("quantity", "Jumlah", "number"), col("weight", "Berat timbang", "number")] :
    tab === "sortir" ? [col("lot", "Lot panen"), col("brown", "Coklat", "number"), col("white", "Putih", "number"), col("defective", "Cacat", "number")] :
      tab === "penjualan" ? [col("lines", "Kategori dan jumlah", "wrap"), ...(money ? [col("buyer", "Pembeli", "wrap"), col("paid", "Dibayar lunas", "number")] : [])] : [col("event", "Kegiatan"), col("stock", "Dampak stok", "wrap")];
  return { rows, columns: [col("date", "Tanggal", "date"), ...details, col("note", "Catatan", "wrap"), col("status", "Status")] };
}

import type { Metadata } from "next";
import { Egg } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { EggAdjustmentForm, GradeForm, HarvestForm, SaleForm } from "@/components/inventory/entry-forms";
import { LedgerTable, type LedgerRow } from "@/components/inventory/ledger-table";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { Badge } from "@/components/ui/badge";
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
const kindLabels = { egg_harvest: "Panen", egg_grading: "Sortir", egg_sale: "Penjualan lunas", egg_adjustment: "Pergerakan stok" } as const;

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
    <ModuleHeader title="Produksi Telur" description="Catat panen aktual, sortir per lot, stok kategori dan penjualan lunas." icon={Egg} action={action} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan produksi telur">
      <MetricCard label="Panen tercatat" value={inPeriod.length ? pieces(inPeriod.reduce((sum, row) => sum + row.pieces, 0)) : "Data belum lengkap"} detail="Seluruh telur termasuk Cacat" />
      <MetricCard label="Berat panen terukur" value={measured ? `${formatQuantity(inPeriod.reduce((sum, row) => sum + (row.grams ?? 0), 0) / 1000)} kg` : "Data belum lengkap"} detail="Dalam periode terpilih" />
      <MetricCard label="Belum Disortir" value={pieces(data.stock.balances.ungraded)} detail={formatDate(query.to)} />
      <MetricCard label="Stok sudah disortir" value={pieces(sortedCategories.reduce((sum, category) => sum + data.stock.balances[category], 0))} detail={sortedCategories.map((category) => `${categoryLabels[category]} ${formatQuantity(data.stock.balances[category])}`).join(" · ")} />
    </section>
    <ModuleTabs path={path} tab={tab} tabs={tabs}>
      <LedgerTable path={path} tab={tab} label={title} rows={rows} columnLabels={columns} query={query} choices={selected} />
    </ModuleTabs>
  </>;
}

function eggRows(data: View, tab: Tab, money: boolean): { columns: string[]; rows: LedgerRow[] } {
  const barn = (id: string) => data.barns.find((row) => row.id === id)?.name ?? "—";
  const flock = (id: string | null) => id ? data.flocks.find((row) => row.id === id)?.name ?? "—" : "Panen campuran";
  if (tab === "stok") return {
    columns: ["Kategori", "Stok tersedia"],
    rows: categories.map((category) => ({ id: category, filter: category, search: categoryLabels[category], cells: [categoryLabels[category], pieces(data.stock.balances[category])] })),
  };
  const kind = tab === "panen" ? "egg_harvest" : tab === "sortir" ? "egg_grading" : tab === "penjualan" ? "egg_sale" : null;
  const rows = data.events.filter((event) => !kind || event.kind === kind).map((event) => {
    const harvest = event.harvest;
    const grade = event.grading;
    const sale = event.sale;
    const detail = event.moves.map((item) => `${categoryLabels[item.category]} ${pieces(item.deltaPieces)}`).join(" · ");
    const fullStatus = <Badge key={event.id} variant={event.effective ? "secondary" : "outline"}>{event.effective ? "Tercatat" : "Dibatalkan"}</Badge>;
    let content;
    let filter = event.moves.map(({ category }) => category).join(",");
    if (tab === "panen" && harvest) {
      filter = harvest.barnId;
      content = [
        barn(harvest.barnId), flock(harvest.flockId), pieces(harvest.pieces),
        harvest.grams === null || harvest.incomplete ? "Data belum lengkap" : `${formatQuantity(harvest.grams / 1000)} kg`,
      ];
    } else if (tab === "sortir" && grade) {
      const source = data.harvests.find(({ id }) => id === grade.harvestId);
      content = [source ? `${formatDate(source.day)} · ${barn(source.barnId)}` : "—", pieces(grade.brown), pieces(grade.white), pieces(grade.defective)];
    } else if (tab === "penjualan" && sale) {
      content = [event.lines.map((line) => `${categoryLabels[line.category]} ${pieces(line.pieces)}`).join(" · "),
        ...(money ? [sale.buyer || "—", typeof sale.paid === "bigint" ? formatIDR(sale.paid) : "—"] : [])];
    } else {
      content = [kindLabels[event.kind as keyof typeof kindLabels] ?? "Pergerakan telur", detail || "—"];
    }
    return {
      id: event.id, filter, search: [formatDate(event.day), ...content, event.note].join(" "),
      cells: [formatDate(event.day), ...content, event.note || "—", fullStatus],
    };
  });
  const details = tab === "panen" ? ["Kandang", "Asal panen", "Jumlah", "Berat timbang"] :
    tab === "sortir" ? ["Lot panen", "Coklat", "Putih", "Cacat"] :
      tab === "penjualan" ? ["Kategori dan jumlah", ...(money ? ["Pembeli", "Dibayar lunas"] : [])] : ["Kegiatan", "Dampak stok"];
  return { rows, columns: ["Tanggal", ...details, "Catatan", "Status"] };
}

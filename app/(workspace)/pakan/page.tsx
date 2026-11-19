import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { FeedAdjustmentForm, FeedClosingForm, FeedIssueForm, FeedMixForm, FeedOpeningForm, FeedPurchaseForm, ProductForm } from "@/components/inventory/entry-forms";
import { LedgerTable, type LedgerRow } from "@/components/inventory/ledger-table";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { Badge } from "@/components/ui/badge";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessDate, formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { feedView } from "@/server/services/feed";

export const metadata: Metadata = { title: "Pakan" };
const path = "/pakan";
const tabs = [
  { value: "stok", label: "Stok" }, { value: "masuk", label: "Pakan masuk" }, { value: "campuran", label: "Mix pakan" },
  { value: "keluar", label: "Pakan keluar" }, { value: "sisa", label: "Sisa harian" }, { value: "penyesuaian", label: "Penyesuaian" },
];
const tabSchema = z.enum(["stok", "masuk", "campuran", "keluar", "sisa", "penyesuaian"]).catch("stok");
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type View = Awaited<ReturnType<typeof feedView>>;
type Tab = z.infer<typeof tabSchema>;
const mass = (grams: number) => `${formatQuantity(grams / 1000)} kg`;
const feedLabel = { ingredient: "Bahan pakan", complete: "Pakan siap pakai", mixed: "Pakan campuran" };

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><FeedContent {...props} /></Suspense>;
}

async function FeedContent({ searchParams }: Props) {
  const actor = await requireModule("pakan");
  const raw = await searchParams;
  const tab = tabSchema.parse(raw.tab);
  const query = ledgerQuery(raw);
  const data = await feedView(await headers(), query);
  const productChoices = data.products.filter(({ active }) => active).map((product) => ({ value: product.id, label: `${product.code} · ${product.name}` }));
  const stockChoices = productChoices.map((choice) => ({
    ...choice,
    label: `${choice.label} · gudang ${mass(data.balances.find((row) => !row.barnId && row.productId === choice.value)?.grams ?? 0)}`,
  }));
  const barnChoices = data.barns.filter(({ active }) => active).map((barn) => ({ value: barn.id, label: barn.name }));
  const outputChoices = productChoices.filter((choice) => data.products.find((item) => item.id === choice.value)?.kind === "mixed");
  const admin = actor.role === "administrator";
  const operator = admin || actor.role === "abk";
  const today = businessDate();
  const props = { today, products: productChoices, barns: barnChoices };
  const action = tab === "stok" && admin ? <div className="flex flex-wrap gap-2"><ProductForm />{productChoices.length > 0 && <FeedOpeningForm {...props} />}</div> :
    tab === "masuk" && admin && productChoices.length ? <FeedPurchaseForm {...props} /> :
    tab === "campuran" && operator && productChoices.length >= 3 && outputChoices.length ? <FeedMixForm today={today} products={stockChoices} outputs={outputChoices} /> :
    tab === "keluar" && operator && productChoices.length && barnChoices.length ? <FeedIssueForm {...props} products={stockChoices} /> :
    tab === "sisa" && operator && productChoices.length && barnChoices.length ? <FeedClosingForm {...props} /> :
    tab === "penyesuaian" && admin && productChoices.length ? <FeedAdjustmentForm {...props} /> : null;
  const warehouse = data.balances.filter(({ barnId }) => barnId === null).reduce((sum, row) => sum + row.grams, 0);
  const barns = data.balances.filter(({ barnId }) => barnId !== null);
  const incomplete = barns.some(({ grams, closedOn }) => grams > 0 && closedOn !== query.to);
  const closings = data.daily.filter(({ day }) => day === query.to);
  const consumed = closings.length && closings.every((row) => row.consumed !== null) && !incomplete
    ? closings.reduce((sum, row) => sum + (row.consumed ?? 0), 0) : null;
  const issued = data.events.filter((event) => event.kind === "feed_issue" && !event.reversed).reduce((sum, event) =>
    sum + event.moves.filter((row) => row.barnId).reduce((sub, row) => sub + row.grams, 0), 0);
  const includeMoney = actor.role !== "abk";
  const { rows, columns } = feedRows(data, tab, includeMoney, query.from, query.to);
  const title = tabs.find((item) => item.value === tab)!.label;
  return <>
    <ModuleHeader title="Pakan" description="Kelola stok gudang, distribusi, campuran dan hasil pengukuran sisa pakan di kandang." icon={Boxes} action={action} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan pakan">
      <MetricCard label="Stok gudang" value={data.products.length ? mass(warehouse) : "Belum ada jenis pakan"} detail={formatDate(query.to)} />
      <MetricCard label="Sisa fisik di kandang" value={incomplete || !barns.length ? "Data belum lengkap" : mass(barns.reduce((sum, row) => sum + row.grams, 0))} detail={formatDate(query.to)} />
      <MetricCard label="Pakan dikirim" value={mass(issued)} detail="Periode terpilih" />
      <MetricCard label="Pakan dikonsumsi" value={consumed === null ? "Data belum lengkap" : mass(consumed)} detail={formatDate(query.to)} />
    </section>
    <ModuleTabs path={path} tab={tab} tabs={tabs}>
      <LedgerTable path={path} tab={tab} label={title} rows={rows} columnLabels={columns} query={query} choices={productChoices} />
    </ModuleTabs>
  </>;
}

function feedRows(data: View, tab: Tab, includeMoney: boolean, from: string, to: string): { rows: LedgerRow[]; columns: string[] } {
  const product = (id: string) => data.products.find((entry) => entry.id === id)?.name ?? "Pakan";
  const barn = (id: string | null) => data.barns.find((entry) => entry.id === id)?.name ?? "Gudang";
  if (tab === "stok") {
    const rows = data.products.flatMap((item) => {
      const balances = data.balances.filter((row) => row.productId === item.id);
      if (!balances.some(({ barnId }) => barnId === null)) balances.unshift({ barnId: null, productId: item.id, grams: 0, value: undefined, closedOn: undefined, closeSequence: undefined });
      return balances.map((row) => ({
        id: `${item.id}:${row.barnId}`, search: `${item.code} ${item.name} ${barn(row.barnId)}`, filter: item.id,
        cells: [`${item.code} · ${item.name}`, feedLabel[item.kind], barn(row.barnId),
          row.barnId && row.grams && row.closedOn !== to ? "Menunggu pengukuran" : mass(row.grams),
          ...(includeMoney ? [row.value === undefined || (row.barnId && row.grams && row.closedOn !== to) ? "—" : formatIDR(row.value)] : [])],
      }));
    });
    return { rows, columns: ["Pakan", "Jenis", "Lokasi", "Berat tersedia", ...(includeMoney ? ["Nilai persediaan"] : [])] };
  }
  if (tab === "sisa") {
    const rows = data.daily.filter(({ day }) => day >= from)
      .sort((left, right) => right.day.localeCompare(left.day)).map((row) => {
        const waste = data.events.filter((event) => event.kind === "feed_close" && !event.reversed && event.day === row.day)
          .flatMap((event) => event.moves).filter((move) => move.barnId === row.barnId && move.productId === row.productId);
        return {
          id: `${row.day}:${row.barnId}:${row.productId}`, filter: row.productId,
          search: `${formatDate(row.day)} ${product(row.productId)} ${barn(row.barnId)}`,
          cells: [formatDate(row.day), product(row.productId), barn(row.barnId),
            row.closing === null ? "Menunggu pencatatan" : mass(row.closing),
            mass(-waste.filter((move) => move.kind === "waste").reduce((sum, move) => sum + move.grams, 0)),
            mass(-waste.filter((move) => move.kind === "return").reduce((sum, move) => sum + move.grams, 0)),
            row.stale ? "Perlu verifikasi ulang" : row.consumed === null ? "Data belum lengkap" : mass(row.consumed)],
        };
      });
    return { rows, columns: ["Tanggal", "Pakan", "Kandang", "Sisa terukur", "Terbuang", "Kembali ke gudang", "Dikonsumsi"] };
  }
  const kinds = {
    masuk: ["feed_purchase"], campuran: ["feed_mix"], keluar: ["feed_issue"], penyesuaian: ["feed_opening", "feed_adjustment"],
  };
  const rows = data.events.filter((event) => kinds[tab].includes(event.kind)).map((event) => {
    const output = event.moves.find((movement) => movement.grams > 0) ?? event.moves[0];
    const otherFields = event.purchase ? [
      event.purchase.supplier, mass(event.purchase.grams),
      ...(includeMoney && typeof event.purchase.total === "bigint" ? [formatIDR(event.purchase.total), formatIDR(event.purchase.total * BigInt(1000) / BigInt(event.purchase.grams))] : []),
    ] : event.mix ? [
      mass(event.mix.outputGrams), mass(event.mix.shrinkageGrams),
      ...(includeMoney ? [event.cost === undefined ? "—" : formatIDR(event.cost)] : []),
    ] : [output ? barn(output.barnId) : "—", output ? mass(output.grams) : "—"];
    return {
      id: event.id, filter: event.moves.map(({ productId }) => productId).join(","),
      search: [formatDate(event.day), output && product(output.productId), event.purchase?.supplier, event.note, output && barn(output.barnId)].join(" "),
      cells: [formatDate(event.day), output ? product(output.productId) : "—", ...otherFields,
        event.note || "—", <Badge key={event.id} variant={event.reversed ? "outline" : "secondary"}>{event.reversed ? "Dibatalkan" : "Tercatat"}</Badge>],
    };
  });
  const details = tab === "masuk" ? ["Pemasok", "Berat", ...(includeMoney ? ["Dibayar", "Rp/kg (pembulatan)"] : [])] :
    tab === "campuran" ? ["Berat hasil", "Susut", ...(includeMoney ? ["Biaya bahan"] : [])] : ["Lokasi", "Berat"];
  return { rows, columns: ["Tanggal", "Pakan", ...details, "Catatan", "Status"] };
}

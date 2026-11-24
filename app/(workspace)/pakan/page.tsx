import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { FeedAdjustmentForm, FeedClosingForm, FeedIssueForm, FeedMixForm, FeedOpeningForm, FeedPurchaseForm, ProductForm } from "@/components/inventory/entry-forms";
import { LedgerTable, type LedgerRow } from "@/components/inventory/ledger-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessDate, formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { feedSection, feedSections, feedTabSchema } from "@/lib/navigation";
import type { Role } from "@/lib/roles";
import { requireModule } from "@/server/auth/workspace";
import { feedView } from "@/server/services/feed";

export const metadata: Metadata = { title: "Pakan" };
const path = "/pakan";
const [stockPage, activityPage, productsPage] = feedSections;
const activityKinds = [
  { value: "masuk", event: "feed_purchase", label: "Pakan Masuk" },
  { value: "keluar", event: "feed_issue", label: "Kirim ke Kandang" },
  { value: "campuran", event: "feed_mix", label: "Campur Pakan" },
] as const;
const activityKindSchema = z.enum(["masuk", "keluar", "campuran", ""]).catch("");
const feedLabel = { ingredient: "Bahan pakan", complete: "Pakan siap pakai", mixed: "Pakan campuran" };
const feedTypes = Object.entries(feedLabel).map(([value, label]) => ({ value, label }));
const mass = (grams: number) => `${formatQuantity(grams / 1000)} kg`;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type View = Awaited<ReturnType<typeof feedView>>;
type Query = ReturnType<typeof ledgerQuery>;
type FeedFormOptions = {
  today: string;
  products: { value: string; label: string }[];
  barns: { value: string; label: string }[];
};
type SectionProps = { data: View; query: Query; role: Role; forms: FeedFormOptions };

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><FeedContent {...props} /></Suspense>;
}

async function FeedContent({ searchParams }: Props) {
  const actor = await requireModule("pakan");
  const raw = await searchParams;
  const tab = feedTabSchema.parse(raw.tab);
  const section = feedSection(tab);
  const query = ledgerQuery(raw);
  const data = await feedView(await headers(), query);
  if (section === "jenis") return <ProductSection data={data} query={query} administrator={actor.role === "administrator"} />;

  const forms = {
    today: businessDate(),
    products: data.products.filter(({ active }) => active).map(({ id, code, name }) => ({ value: id, label: `${code} · ${name}` })),
    barns: data.barns.filter(({ active }) => active).map(({ id, name }) => ({ value: id, label: name })),
  };
  const props = { data, query, role: actor.role, forms };
  if (section === "aktivitas") {
    const kind = activityKindSchema.parse(tab === "aktivitas" ? raw.jenis : tab);
    return <ActivitySection {...props} kind={kind} />;
  }
  return <StockSection {...props} view={tab === "sisa" || tab === "penyesuaian" ? tab : "stok"} />;
}

function ProductSection({ data, query, administrator }: { data: View; query: Query; administrator: boolean }) {
  const rows = data.products.map(({ id, code, name, kind, active }): LedgerRow => ({
    id, filter: kind, search: `${code} ${name} ${feedLabel[kind]}`,
    cells: [code, name, feedLabel[kind], <Badge key="status" variant={active ? "secondary" : "outline"}>{active ? "Aktif" : "Nonaktif"}</Badge>],
  }));
  return <>
    <ModuleHeader title={productsPage.label} description="Daftar bahan pakan, pakan siap pakai, dan hasil campuran yang dapat dipilih saat pencatatan." icon={Boxes}
      action={administrator && <ProductForm />} />
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan jenis pakan aktif">
      {feedTypes.map(({ value, label }) => <MetricCard key={value} label={label}
        value={data.products.filter(({ active, kind }) => active && kind === value).length} detail="Jenis aktif" />)}
    </section>
    <LedgerTable path={path} tab={productsPage.value} query={query} label="Daftar jenis pakan" rows={rows}
      columnLabels={["Kode", "Nama pakan", "Jenis", "Status"]} choices={feedTypes} filterLabel="Jenis" showPeriod={false}
      empty={!rows.length ? <EmptyState title="Belum ada jenis pakan" description={administrator
        ? "Gunakan Tambah jenis pakan agar pakan bisa dipilih saat pencatatan."
        : "Hubungi Administrator untuk mendaftarkan jenis pakan."} /> : undefined} />
  </>;
}

function ActivitySection({ data, query, role, forms, kind }: SectionProps & { kind: z.infer<typeof activityKindSchema> }) {
  const administrator = role === "administrator";
  const operator = administrator || role === "abk";
  const stockChoices = forms.products.map((choice) => ({
    ...choice, label: `${choice.label} · gudang ${mass(data.balances.find((row) => !row.barnId && row.productId === choice.value)?.grams ?? 0)}`,
  }));
  const outputChoices = forms.products.filter((choice) => data.products.some(({ id, kind }) => id === choice.value && kind === "mixed"));
  const primary = kind || (administrator ? "masuk" : "keluar");
  const totals = { masuk: 0, keluar: 0, campuran: 0 };
  const rows: LedgerRow[] = [];
  for (const event of data.events) {
    const activity = activityKinds.find(({ event: eventKind }) => eventKind === event.kind);
    if (!activity) continue;
    const output = event.moves.find(({ grams }) => grams > 0);
    const grams = event.purchase?.grams ?? event.mix?.outputGrams ?? output?.grams ?? 0;
    if (!event.reversed) totals[activity.value] += grams;
    if (kind && activity.value !== kind) continue;

    const product = data.products.find(({ id }) => id === output?.productId)?.name ?? "—";
    const detail = event.purchase?.supplier ?? (event.mix
      ? `Susut ${mass(event.mix.shrinkageGrams)}`
      : data.barns.find(({ id }) => id === output?.barnId)?.name ?? "—");
    const total = event.purchase?.total;
    const cost = typeof total === "bigint" && event.purchase
      ? <><span className="block">{formatIDR(total)}</span><span className="text-xs text-muted-foreground">{formatIDR(total * BigInt(1000) / BigInt(event.purchase.grams))}/kg</span></>
      : event.mix && typeof event.cost === "bigint" ? formatIDR(event.cost) : "—";
    rows.push({
      id: event.id,
      filter: event.moves.map(({ productId }) => productId).join(","),
      search: [formatDate(event.day), activity.label, product, detail, event.note].join(" "),
      cells: [formatDate(event.day), activity.label, product, mass(grams),
        <div key="detail"><span>{detail}</span>{event.note && <p className="text-sm text-muted-foreground">{event.note}</p>}</div>,
        ...(role === "abk" ? [] : [cost]),
        <Badge key="status" variant={event.reversed ? "outline" : "secondary"}>{event.reversed ? "Dibatalkan" : "Tercatat"}</Badge>],
    });
  }

  return <>
    <ModuleHeader title={activityPage.label} description="Catat pembelian yang masuk gudang, pengiriman ke kandang, atau hasil campuran. Telusuri semuanya dalam satu riwayat." icon={Boxes}
      action={operator && forms.products.length > 0 && <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-64">
        {administrator && <FeedPurchaseForm {...forms} triggerVariant={primary === "masuk" ? "default" : "outline"} />}
        {forms.barns.length > 0 && <FeedIssueForm {...forms} products={stockChoices} triggerVariant={primary === "keluar" ? "default" : "outline"} />}
        {forms.products.length >= 3 && outputChoices.length > 0 && <FeedMixForm today={forms.today} products={stockChoices} outputs={outputChoices}
          triggerVariant={primary === "campuran" ? "default" : "outline"} />}
      </div>} />
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Ringkasan aktivitas pakan">
      <MetricCard label="Pakan diterima gudang" value={mass(totals.masuk)} detail="Periode terpilih" />
      <MetricCard label="Pakan dikirim ke kandang" value={mass(totals.keluar)} detail="Periode terpilih" />
      <MetricCard label="Hasil campuran" value={mass(totals.campuran)} detail="Periode terpilih" />
    </section>
    <LedgerTable path={path} tab={activityPage.value} label="Riwayat aktivitas pakan" query={query} rows={rows}
      columnLabels={["Tanggal", "Aktivitas", "Pakan", "Berat", "Rincian", ...(role === "abk" ? [] : ["Biaya"]), "Status"]}
      choices={forms.products} filterLabel="Pakan" kind={{ value: kind, choices: [...activityKinds] }}
      empty={forms.products.length === 0 ? <EmptyState title="Belum ada jenis pakan" description={administrator
        ? "Daftarkan jenis pakan sebelum mencatat pembelian, pengiriman, atau campuran."
        : "Minta Administrator mendaftarkan jenis pakan terlebih dahulu."}
        action={administrator && <Link href={productsPage.href} className={buttonVariants()}>Buka Jenis Pakan</Link>} /> : undefined} />
  </>;
}

function StockSection({ data, query, role, forms, view }: SectionProps & { view: "stok" | "sisa" | "penyesuaian" }) {
  const administrator = role === "administrator";
  const operator = administrator || role === "abk";
  const warehouse = data.balances.filter(({ barnId }) => barnId === null).reduce((sum, row) => sum + row.grams, 0);
  const barnBalances = data.balances.filter(({ barnId }) => barnId !== null);
  const daily = data.daily.filter(({ day }) => day === query.to);
  const measured = daily.filter(({ closing, stale }) => closing !== null && !stale);
  const consumed = daily.length > 0 && daily.every(({ consumed }) => consumed !== null)
    ? daily.reduce((sum, row) => sum + (row.consumed ?? 0), 0) : null;
  const summary = `Per ${formatDate(query.to)}`;
  const table = view === "sisa" ? closingHistory(data, query.from) : view === "penyesuaian"
    ? adjustmentHistory(data) : stockRows(data, query.to, role, forms);
  const historyLinks = [
    { tab: "stok", label: "Posisi stok" },
    { tab: "sisa", label: "Riwayat sisa harian" },
    { tab: "penyesuaian", label: administrator ? "Saldo awal dan penyesuaian" : "Riwayat saldo awal dan penyesuaian" },
  ].filter(({ tab }) => tab !== view);
  const action = view === "penyesuaian"
    ? administrator && forms.products.length > 0 && <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-64">
      <FeedOpeningForm {...forms} /><FeedAdjustmentForm {...forms} />
    </div>
    : operator && forms.products.length > 0 && forms.barns.length > 0 && <FeedClosingForm {...forms} />;

  return <>
    <ModuleHeader title={stockPage.label} description="Lihat posisi gudang dan kandang. Timbang sisa pakan di akhir hari agar pemakaian bisa dihitung." icon={Boxes}
      action={action} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan stok pakan">
      <MetricCard label="Stok gudang" value={data.products.length ? mass(warehouse) : "Belum ada jenis pakan"} detail={summary} />
      <MetricCard label="Sisa terukur di kandang" value={daily.length && measured.length === daily.length
        ? mass(barnBalances.reduce((sum, row) => sum + row.grams, 0)) : "Data belum lengkap"} detail={summary} />
      <MetricCard label="Pengukuran sisa harian" value={daily.length ? `${measured.length} dari ${daily.length}` : "Belum ada pencatatan"} detail={summary} />
      <MetricCard label="Pakan dikonsumsi" value={consumed === null ? "Data belum lengkap" : mass(consumed)} detail={summary} />
    </section>
    <section className="min-w-0 space-y-3" aria-label={table.label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{table.label}</h2>
        <nav className="flex flex-wrap gap-2" aria-label="Tampilan stok pakan">
          {historyLinks.map(({ tab, label }) => (
            <Link key={tab} className={buttonVariants({ variant: "outline" })} href={`${path}?${new URLSearchParams({
              tab, mulai: query.from, akhir: query.to, ...(query.filter ? { filter: query.filter } : {}),
            })}`}>{label}</Link>
          ))}
        </nav>
      </div>
      <LedgerTable path={path} tab={view} query={query} label={table.label} rows={table.rows}
        columnLabels={table.columns} choices={forms.products} filterLabel="Pakan"
        empty={data.products.length === 0 ? <EmptyState title="Belum ada jenis pakan" description={administrator
          ? "Daftarkan jenis pakan terlebih dahulu agar stoknya bisa dicatat."
          : "Hubungi Administrator untuk mendaftarkan jenis pakan."}
          action={administrator && <Link href={productsPage.href} className={buttonVariants()}>Buka Jenis Pakan</Link>} /> : undefined} />
    </section>
  </>;
}

function stockRows(data: View, day: string, role: Role, forms: FeedFormOptions) {
  const operator = role === "administrator" || role === "abk";
  const includeMoney = role !== "abk";
  const statuses = new Map(data.daily.filter((row) => row.day === day).map((row) => [`${row.barnId}:${row.productId}`, row]));
  const rows = data.products.flatMap((item): LedgerRow[] => {
    const balances = data.balances.filter(({ productId }) => productId === item.id);
    if (!balances.some(({ barnId }) => barnId === null)) {
      balances.unshift({ barnId: null, productId: item.id, grams: 0, value: undefined, closedOn: undefined, closeSequence: undefined });
    }
    return balances.map((row) => {
      const barn = data.barns.find(({ id }) => id === row.barnId);
      const reading = statuses.get(`${row.barnId}:${item.id}`);
      const missing = reading?.closing === null;
      const stale = reading?.stale;
      const status = stale ? "Perlu verifikasi ulang" : missing ? "Belum diukur" : reading ? "Sudah diukur" : null;
      const canMeasure = operator && day === forms.today && missing && item.active && barn?.active;
      return {
        id: `${item.id}:${row.barnId}`, search: `${item.code} ${item.name} ${barn?.name ?? "Gudang"}`, filter: item.id,
        cells: [
          <div key="stock-item" className="min-w-32 space-y-1">
            <p>{item.code} · {item.name}</p>
            <p className="text-sm text-muted-foreground">{barn?.name ?? "Gudang"}</p>
            {status && <Badge variant={missing || stale ? "outline" : "secondary"}>{status}</Badge>}
            {canMeasure && <div className="pt-1"><FeedClosingForm {...forms} selection={{ productId: item.id, barnId: barn.id }} /></div>}
          </div>,
          missing || stale ? "—" : mass(row.grams),
          ...(includeMoney ? [row.value === undefined || missing || stale ? "—" : formatIDR(row.value)] : []),
        ],
      };
    });
  });
  return { label: "Posisi stok", rows, columns: ["Pakan dan lokasi", "Berat tersedia", ...(includeMoney ? ["Nilai persediaan"] : [])] };
}

function closingHistory(data: View, from: string) {
  const rows = data.daily.filter(({ day }) => day >= from).sort((left, right) => right.day.localeCompare(left.day)).map((row): LedgerRow => {
    const movements = data.events.filter((event) => event.kind === "feed_close" && !event.reversed && event.day === row.day)
      .flatMap((event) => event.moves).filter((move) => move.barnId === row.barnId && move.productId === row.productId);
    const product = data.products.find(({ id }) => id === row.productId)?.name ?? "Pakan";
    const barn = data.barns.find(({ id }) => id === row.barnId)?.name ?? "—";
    return {
      id: `${row.day}:${row.barnId}:${row.productId}`, filter: row.productId, search: `${formatDate(row.day)} ${product} ${barn}`,
      cells: [formatDate(row.day), product, barn, row.closing === null ? "Belum diukur" : mass(row.closing),
        mass(-movements.filter(({ kind }) => kind === "waste").reduce((sum, move) => sum + move.grams, 0)),
        mass(-movements.filter(({ kind }) => kind === "return").reduce((sum, move) => sum + move.grams, 0)),
        row.stale ? "Perlu verifikasi ulang" : row.consumed === null ? "Data belum lengkap" : mass(row.consumed)],
    };
  });
  return { label: "Riwayat sisa harian", rows, columns: ["Tanggal", "Pakan", "Kandang", "Sisa terukur", "Terbuang", "Kembali ke gudang", "Dikonsumsi"] };
}

function adjustmentHistory(data: View) {
  const rows = data.events.filter(({ kind }) => kind === "feed_opening" || kind === "feed_adjustment").map((event): LedgerRow => {
    const move = event.moves[0];
    const product = data.products.find(({ id }) => id === move?.productId)?.name ?? "Pakan";
    const location = data.barns.find(({ id }) => id === move?.barnId)?.name ?? "Gudang";
    const type = event.kind === "feed_opening" ? "Saldo awal" : "Penyesuaian";
    return {
      id: event.id, filter: move?.productId, search: `${formatDate(event.day)} ${product} ${location} ${type} ${event.note}`,
      cells: [formatDate(event.day), type, product, location, move ? mass(move.grams) : "—", event.note || "—",
        <Badge key="status" variant={event.reversed ? "outline" : "secondary"}>{event.reversed ? "Dibatalkan" : "Tercatat"}</Badge>],
    };
  });
  return { label: "Riwayat saldo awal dan penyesuaian", rows, columns: ["Tanggal", "Jenis", "Pakan", "Lokasi", "Berat", "Catatan", "Status"] };
}

import { tableColumn as col, type DataColumn } from "@/components/shared/data-table";
import type { Metadata } from "next";
import { Store } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { LedgerTable, ledgerCell, type LedgerRow } from "@/components/inventory/ledger-table";
import { CancelResellerForm, ResellerCashForm, ResellerStockAdjustmentForm, ResellerTradeForm, UnitDefinitionForm } from "@/components/reseller/entry-forms";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { Badge } from "@/components/ui/badge";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { categories, resellerCategoryLabels, type ResellerCategory } from "@/lib/domain/reseller";
import { businessDate, formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { resellerView } from "@/server/services/reseller";

export const metadata: Metadata = { title: "Reseller" };
const path = "/reseller";
const tabs = [
  { value: "stok", label: "Stok" }, { value: "masuk", label: "Stok masuk" }, { value: "penjualan", label: "Penjualan" },
  { value: "kas", label: "Keuangan" }, { value: "satuan", label: "Satuan" },
];
const tabSchema = z.enum(["stok", "masuk", "penjualan", "kas", "satuan"]).catch("stok");
type View = Awaited<ReturnType<typeof resellerView>>;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const txLabels: Readonly<Record<string, string>> = {
  stock_opening: "Saldo awal stok", intake: "Stok masuk", sale: "Penjualan", stock_adjustment: "Penyesuaian stok",
  cash_opening: "Saldo awal kas", cash_manual: "Kas mandiri", reversal: "Pembalik",
};
const category = (value: string) => resellerCategoryLabels[value as ResellerCategory] ?? value;
const cashLabels = { income: "Pemasukan", expense: "Pengeluaran", opening: "Saldo awal", reversal: "Pembalik" };
const pieces = (value: number) => `${formatQuantity(value)} butir`;

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><ResellerContent {...props} /></Suspense>;
}

async function ResellerContent({ searchParams }: Props) {
  await requireModule("reseller");
  const raw = await searchParams;
  const query = ledgerQuery(raw);
  const tab = tabSchema.parse(raw.tab);
  const data = await resellerView(await headers(), query);
  const today = businessDate();
  const action = tab === "stok" ? <ResellerStockAdjustmentForm today={today} /> :
    tab === "masuk" || tab === "penjualan" ? <ResellerTradeForm today={query.to} units={data.units} sale={tab === "penjualan"} /> :
    tab === "kas" ? <div className="flex flex-wrap gap-2">{!data.finance.opening && <ResellerCashForm today={today} opening />}<ResellerCashForm today={today} /></div> :
    <UnitDefinitionForm today={today} />;
  const rows = resellerRows(data, tab, today);
  const choices = tab === "kas" ? Object.entries(cashLabels).map(([value, label]) => ({ value, label })) :
    tab === "satuan" ? [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }, { value: "past", label: "Versi lama" }] :
    categories.map((value) => ({ value, label: category(value) }));
  return <>
    <ModuleHeader title="Reseller" description="Kelola stok, penjualan, satuan kemasan dan kas usaha reseller Anda." icon={Store} action={action} />
    <section aria-label="Ringkasan reseller" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Stok tersedia" value={pieces(Object.values(data.balances).reduce((sum, value) => sum + value, 0))} detail={formatDate(query.to)} />
      <MetricCard label="Pemasukan" value={formatIDR(data.finance.income)} detail="Periode terpilih" />
      <MetricCard label="Pengeluaran" value={formatIDR(data.finance.expense)} detail="Periode terpilih" />
      <MetricCard label="Saldo kas" value={formatIDR(data.finance.balance)} detail={formatDate(query.to)} />
    </section>
    <ModuleTabs path={path} tab={tab} tabs={tabs}>
      <div className="space-y-4">
        {tab === "stok" && <LedgerTable path={path} tab={tab} label="Saldo stok per kategori" query={{ ...query, page: 1 }}
          columns={[col("stock-category", "Kategori"), col("stock-balance", "Saldo stok", "number")]} choices={choices}
          rows={categories.map((value) => ({ id: value, search: category(value), filter: value, cells: [category(value), ledgerCell(data.balances[value], pieces(data.balances[value]))] }))} />}
        <LedgerTable path={path} tab={tab} label={tab === "stok" ? "Pergerakan stok" : tabs.find((item) => item.value === tab)!.label}
          rows={rows.rows} columns={rows.columns} query={query} choices={choices} />
      </div>
    </ModuleTabs>
  </>;
}

function resellerRows(data: View, tab: z.infer<typeof tabSchema>, today: string): { rows: LedgerRow[]; columns: DataColumn[] } {
  if (tab === "satuan") {
    const latest = new Set<string>();
    return {
      columns: [col("effective", "Berlaku sejak", "date"), col("code", "Kode"), col("unit", "Satuan", "wrap"), col("factor", "Butir per kemasan", "number"), col("revision", "Versi", "number"), col("status", "Status")],
      rows: data.units.map((unit) => {
        const current = !latest.has(unit.code);
        latest.add(unit.code);
        const status = !current ? "past" : unit.active ? "active" : "inactive";
        return {
          id: unit.id, filter: status, search: `${unit.code} ${unit.name}`,
          cells: [ledgerCell(unit.effectiveDate, formatDate(unit.effectiveDate)), unit.code, unit.name, ledgerCell(unit.piecesPerUnit, pieces(unit.piecesPerUnit)), ledgerCell(unit.revision, formatQuantity(unit.revision)),
            status === "past" ? "Versi lama" : status === "active" ? "Aktif" : "Nonaktif"],
          actions: current ? <UnitDefinitionForm today={today} unit={unit} /> : undefined,
        };
      }),
    };
  }
  const selected = data.events.filter((row) => tab === "stok" ? Boolean(row.stock) : tab === "kas" ? Boolean(row.cash) :
    tab === "masuk" ? row.kind === "intake" : row.kind === "sale");
  const rows = selected.map((row) => {
    const label = txLabels[row.kind] ?? "Pergerakan reseller";
    const stock = row.stock;
    const cash = row.cash;
    const converted = stock?.unit === "packaging" ? `${stock.unitCount} × ${stock.piecesPerUnit} butir` :
      stock?.unit === "kg" && stock.actualGrams ? `${formatQuantity(stock.actualGrams / 1000)} kg terukur` : "Butir";
    const categoryName = stock ? category(stock.category) : cash?.category ?? "—";
    const detail = tab === "kas" ? [cash?.category ?? "—", cash ? formatIDR(cash.deltaIdr) : "—"] : [
      categoryName, pieces(stock?.deltaPieces ?? 0), converted,
      ...(tab !== "stok" ? [cash ? formatIDR(cash.deltaIdr) : formatIDR(BigInt(0))] : []),
    ];
    const convertedValue = stock?.unit === "packaging" ? { unit: "kemasan", amount: stock.unitCount ?? 0 } :
      stock?.unit === "kg" && stock.actualGrams ? { unit: "kg", amount: stock.actualGrams } :
        stock ? { unit: "butir", amount: stock.deltaPieces } : null;
    const values = tab === "kas" ? [ledgerCell(cash?.category, detail[0]), ledgerCell(cash?.deltaIdr, detail[1])] :
      [categoryName, ledgerCell(stock?.deltaPieces, detail[1]), ledgerCell(convertedValue, converted),
        ...(tab !== "stok" ? [ledgerCell(cash?.deltaIdr ?? BigInt(0), detail[3])] : [])];
    return {
      id: row.id, filter: tab === "kas" ? cash?.direction : stock?.category,
      search: [formatDate(row.day), label, categoryName, row.note, ...detail].join(" "),
      cells: [ledgerCell(row.day, formatDate(row.day)), label, ...values, ledgerCell(row.note || null, row.note || "—"),
        ledgerCell(row.active ? "Tercatat" : "Dibatalkan", <Badge variant={row.active ? "secondary" : "outline"}>{row.active ? "Tercatat" : "Dibatalkan"}</Badge>)],
      actions: row.active && !row.reversesId ? <CancelResellerForm id={row.id} /> : undefined,
    };
  });
  return { rows, columns: [
    col("date", "Tanggal", "date"), col("event", "Kegiatan"), col("category", "Kategori", "wrap"),
    ...(tab === "kas" ? [col("amount", "Jumlah", "number")] : [col("pieces", "Perubahan stok", "number"), col("unit", "Satuan"), ...(tab === "stok" ? [] : [col("cash", "Kas terkait", "number")])]),
    col("note", "Catatan", "wrap"), col("status", "Status"),
  ] };
}

import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { CashOpeningForm, ManualCashForm } from "@/components/finance/cash-forms";
import { CorrectionForm } from "@/components/finance/correction-forms";
import { CorrectionTable } from "@/components/finance/correction-table";
import { CleanupReceipts, ReceiptDialog } from "@/components/finance/receipt-dialog";
import { LedgerTable } from "@/components/inventory/ledger-table";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { Badge } from "@/components/ui/badge";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessDate, formatDate, formatIDR } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { financeView } from "@/server/services/finance";

export const metadata: Metadata = { title: "Keuangan" };
const path = "/keuangan";
const tabs = [
  { value: "ringkasan", label: "Ringkasan" }, { value: "pemasukan", label: "Pemasukan" },
  { value: "pengeluaran", label: "Pengeluaran" }, { value: "riwayat", label: "Riwayat dan koreksi" },
];
const tabSchema = z.enum(["ringkasan", "pemasukan", "pengeluaran", "riwayat"]).catch("ringkasan");
const sources: Record<string, string> = { egg_sale: "Penjualan telur", feed_purchase: "Pembelian pakan", cash_manual: "Kas mandiri", cash_opening: "Saldo awal", reversal: "Pembalik koreksi" };
const cashLabels = { opening: "Saldo awal", income: "Pemasukan", expense: "Pengeluaran", reversal: "Pembalik" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><FinanceContent {...props} /></Suspense>;
}

async function FinanceContent({ searchParams }: Props) {
  const actor = await requireModule("keuangan");
  const context = await headers();
  const raw = await searchParams;
  const tab = tabSchema.parse(raw.tab);
  const query = ledgerQuery(raw);
  const data = await financeView(context, query);
  const administrator = actor.role === "administrator";
  const today = businessDate();
  const action = !administrator ? null : tab === "ringkasan" && !data.hasOpening ? <CashOpeningForm today={today} /> :
    tab === "pemasukan" ? <ManualCashForm today={today} direction="income" /> :
    tab === "pengeluaran" ? <ManualCashForm today={today} direction="expense" /> :
    tab === "riwayat" ? <CleanupReceipts /> : null;
  const selected = data.rows.filter((row) => tab === "pemasukan" ? row.direction === "income" :
    tab === "pengeluaran" ? row.direction === "expense" : true);
  const rows = selected.map((row) => {
    const source = sources[row.origin] ?? "Transaksi kas";
    const editable = Boolean(administrator && row.effective && !row.reversesId);
    return {
      id: row.id, filter: row.direction, search: [row.category, source, row.note, formatIDR(row.delta)].join(" "),
      cells: [formatDate(row.date), row.category, source, formatIDR(row.delta), row.note || "—",
        <Badge key={row.id} variant={row.effective ? "secondary" : "outline"}>{row.effective ? cashLabels[row.direction] : "Dibatalkan"}</Badge>,
        !row.reversesId && (row.attachment || editable) ? <ReceiptDialog key={row.id} cashId={row.id} active={Boolean(row.attachment)} uploadAllowed={editable} /> : "—",
        ...(administrator ? [editable ? <CorrectionForm key={row.id} direct selected={{
          value: row.id, label: source, modes: row.origin === "cash_manual" ? ["cancel", "amount"] : ["cancel"],
        }} /> : "—"] : [])],
    };
  });
  return <>
    <ModuleHeader title="Keuangan" description="Tinjau saldo kas, pemasukan, pengeluaran dan sumber transaksinya." icon={Wallet} action={action} />
    <section aria-label="Ringkasan kas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Saldo kas" value={data.count ? formatIDR(data.balance) : "Belum ada catatan"} detail={formatDate(query.to)} />
      <MetricCard label="Pemasukan" value={formatIDR(data.income)} detail="Periode terpilih" />
      <MetricCard label="Pengeluaran" value={formatIDR(data.expense)} detail="Periode terpilih" />
      <MetricCard label="Arus kas bersih" value={formatIDR(data.net)} detail="Pemasukan dikurangi pengeluaran" />
    </section>
    <ModuleTabs path={path} tab={tab} tabs={tabs}>
      <div className="space-y-5">
        <LedgerTable path={path} tab={tab} query={query} label="Buku kas farm" rows={rows}
          columnLabels={["Tanggal", "Kategori", "Sumber", "Jumlah", "Catatan", "Status", "Bukti", ...(administrator ? ["Koreksi"] : [])]}
          choices={Object.entries(cashLabels).map(([value, label]) => ({ value, label }))} />
        {tab === "riwayat" && administrator && <CorrectionTable path={path} tab={tab} query={query} administrator />}
      </div>
    </ModuleTabs>
  </>;
}

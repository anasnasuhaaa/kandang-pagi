import { tableColumn as col } from "@/components/shared/data-table";
import { headers } from "next/headers";
import { LedgerTable, ledgerCell } from "@/components/inventory/ledger-table";
import { MetricCard } from "@/components/shared/module";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { correctionView } from "@/server/services/corrections";
import { CorrectionForm, ReviewCorrectionForm, type CorrectionChoice } from "./correction-forms";

const labels: Record<string, string> = {
  population: "Mutasi ternak", feed_opening: "Saldo awal pakan", feed_purchase: "Pakan masuk", feed_mix: "Mix pakan",
  feed_issue: "Pakan keluar", feed_close: "Sisa harian pakan", feed_adjustment: "Penyesuaian pakan", egg_harvest: "Panen telur",
  egg_grading: "Sortir telur", egg_sale: "Penjualan telur", egg_adjustment: "Penyesuaian telur", cash_manual: "Kas mandiri", cash_opening: "Saldo awal kas",
};
const statuses = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };
type Query = { from: string; to: string; search: string; page: number; filter: string };

export async function CorrectionTable({ path, tab, query, administrator }: { path: string; tab: string; query: Query; administrator: boolean }) {
  const { requests, candidates } = await correctionView(await headers());
  const choices: CorrectionChoice[] = candidates.map((row) => ({
    value: row.id, label: `${formatDate(row.day)} · ${labels[row.kind] ?? "Kegiatan"}${row.note ? ` · ${row.note}` : ""}`,
    modes: ["cancel", ...(row.kind === "cash_manual" ? ["amount" as const] : []),
      ...(row.isClose ? ["closing" as const] : []),
      ...(row.populationKind && row.populationKind !== "transfer" ? ["count" as const] : [])],
  }));
  const visible = requests.filter(({ day, request }) => (day >= query.from && day <= query.to) || request.status === "pending");
  const rows = visible.map(({ request, day, kind, requester }) => {
    const before = request.original;
    const proposed = request.proposed;
    const original = typeof before.amount === "string" ? formatIDR(BigInt(before.amount)) :
      typeof before.count === "number" ? `${formatQuantity(before.count)} ekor` :
      typeof before.closing === "number" ? `${formatQuantity(before.closing / 1000)} kg` : "Catatan aktif";
    const after = proposed.method === "amount" && typeof proposed.value === "string" ? formatIDR(BigInt(proposed.value)) :
      proposed.method === "count" && typeof proposed.value === "number" ? `${formatQuantity(proposed.value)} ekor` :
      proposed.method === "closing" && typeof proposed.value === "number" ? `${formatQuantity(proposed.value / 1000)} kg` : "Pembatalan";
    const label = labels[kind] ?? "Catatan";
    const originalValue = typeof before.amount === "string" ? { unit: "idr", amount: BigInt(before.amount) } :
      typeof before.count === "number" ? { unit: "ekor", amount: before.count } :
      typeof before.closing === "number" ? { unit: "kg", amount: before.closing } : "Catatan aktif";
    const proposedValue = proposed.method === "amount" && typeof proposed.value === "string" ? { unit: "idr", amount: BigInt(proposed.value) } :
      proposed.method === "count" && typeof proposed.value === "number" ? { unit: "ekor", amount: proposed.value } :
      proposed.method === "closing" && typeof proposed.value === "number" ? { unit: "kg", amount: proposed.value } : "Pembatalan";
    return {
      id: request.id, filter: request.status, search: [label, requester, request.reason, request.reviewReason].join(" "),
      cells: [ledgerCell(day, formatDate(day)), label, requester, ledgerCell(originalValue, original), ledgerCell(proposedValue, after), request.reason,
        ledgerCell(statuses[request.status], <Badge variant={request.status === "rejected" ? "outline" : "secondary"}>{statuses[request.status]}</Badge>),
        ledgerCell(request.reviewReason, request.reviewReason ?? "—")],
      actions: administrator && request.status === "pending" ? <ReviewCorrectionForm id={request.id} /> : undefined,
    };
  });
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <MetricCard label="Koreksi menunggu" value={requests.filter(({ request }) => request.status === "pending").length} />
      {choices.length > 0 && <CorrectionForm choices={choices} direct={false} />}
    </div>
    <LedgerTable path={path} tab={tab} label="Permintaan koreksi" rows={rows} query={query}
      columns={[col("correction-date", "Tanggal catatan", "date"), col("correction-event", "Kegiatan"), col("requester", "Pemohon"), col("original", "Nilai awal", "number"), col("proposed", "Usulan", "number"), col("reason", "Alasan", "wrap"), col("correction-status", "Status"), col("review", "Alasan tinjauan", "wrap")]}
      choices={Object.entries(statuses).map(([value, label]) => ({ value, label }))} />
  </section>;
}

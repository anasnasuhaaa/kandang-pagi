import { headers } from "next/headers";
import { LedgerTable } from "@/components/inventory/ledger-table";
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
    return {
      id: request.id, filter: request.status, search: [label, requester, request.reason, request.reviewReason].join(" "),
      cells: [formatDate(day), label, requester, original, after, request.reason,
        <Badge key={request.id} variant={request.status === "rejected" ? "outline" : "secondary"}>{statuses[request.status]}</Badge>,
        request.reviewReason ?? "—",
        ...(administrator ? [request.status === "pending" ? <ReviewCorrectionForm key={request.id} id={request.id} /> : "—"] : [])],
    };
  });
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <MetricCard label="Koreksi menunggu" value={requests.filter(({ request }) => request.status === "pending").length} />
      {choices.length > 0 && <CorrectionForm choices={choices} direct={false} />}
    </div>
    <LedgerTable path={path} tab={tab} label="Permintaan koreksi" rows={rows} query={query}
      columnLabels={["Tanggal catatan", "Kegiatan", "Pemohon", "Nilai awal", "Usulan", "Alasan", "Status", "Alasan tinjauan", ...(administrator ? ["Tindakan"] : [])]}
      choices={Object.entries(statuses).map(([value, label]) => ({ value, label }))} />
  </section>;
}

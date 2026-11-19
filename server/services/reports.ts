import { database } from "../../db";
import { barns, flocks } from "../../db/schema";
import { categoryLabels, sortedCategories, type Category } from "../../lib/domain/production-input";
import { cashFilterLabels, reportNames, reportPeriod, reportQuerySchema, type ReportData, type ReportInput, type ReportSection } from "../../lib/domain/report";
import { categories, resellerCategoryLabels, type ResellerCategory } from "../../lib/domain/reseller";
import { formatDate, formatIDR, formatQuantity } from "../../lib/format";
import { requireAuth } from "../auth/permissions";
import { eggView } from "./eggs";
import { ServiceError } from "./errors";
import { parseInput } from "./farm";
import { feedConsumedForBarns, feedProjection, feedView } from "./feed";
import { financeView } from "./finance";
import { populationDashboard } from "./population";
import { productionSummary } from "./production-summary";
import { resellerView } from "./reseller";

const limit = 300;
const unavailable = "Data belum lengkap";
const qty = (value: number) => formatQuantity(value);
const nullable = (value: number | null, unit: string) => value === null ? unavailable : `${qty(value)}${unit}`;
const mass = (grams: number | null) => nullable(grams === null ? null : grams / 1000, " kg");
const money = (value: bigint) => formatIDR(value);
const category = (value: string) => resellerCategoryLabels[value as ResellerCategory] ?? value;

type Period = ReturnType<typeof reportPeriod>;
export type ReportFilters = {
  families: ReportData["family"][];
  barns: { value: string; label: string }[];
  flocks: { value: string; label: string }[];
};

export async function reportFilters(headers: Headers, db = database()): Promise<ReportFilters> {
  const user = await requireAuth(headers, db);
  if (user.role === "reseller") return { families: ["reseller"], barns: [], flocks: [] };
  const [barn, flock] = await Promise.all([
    db.select({ value: barns.id, label: barns.name }).from(barns).orderBy(barns.name),
    db.select({ value: flocks.id, label: flocks.name }).from(flocks).orderBy(flocks.name),
  ]);
  return { families: user.role === "abk" ? ["operasional"] : ["operasional", "keuangan"], barns: barn, flocks: flock };
}

export async function reportData(headers: Headers, raw: unknown, db = database()): Promise<ReportData> {
  const actor = await requireAuth(headers, db);
  const input = parseInput(reportQuerySchema, raw);
  const family = input.jenis ?? (actor.role === "reseller" ? "reseller" : "operasional");
  if ((family === "reseller") !== (actor.role === "reseller") || (family === "keuangan" && actor.role === "abk")) {
    throw new ServiceError("forbidden", "Anda tidak memiliki akses ke jenis laporan ini.");
  }
  if (family !== "operasional" && (input.kandang || input.kelompok)) {
    throw new ServiceError("invalid", "Filter kandang dan kelompok hanya berlaku untuk laporan operasional.");
  }
  const period = reportPeriod(input);
  const base = { ...period, family, title: `Laporan ${reportNames[family]}`, generatedAt: new Date() };
  const scope = family === "operasional" ? await operations(headers, period, input, db) :
    family === "keuangan" ? await farmFinance(headers, period, input, db) :
      await resellerReport(headers, period, input, db);
  const needle = input.cari?.toLocaleLowerCase("id-ID");
  const sections = needle ? scope.sections.map((section) => ({
    ...section, rows: section.rows.filter((row) => row.join(" ").toLocaleLowerCase("id-ID").includes(needle)),
  })) : scope.sections;
  const truncated = sections.some((section) => section.rows.length > limit);
  return {
    ...base, ...scope, criteria: [...scope.criteria, ...(input.cari ? [`Pencarian rincian: ${input.cari}`] : [])], sections: sections.map((section) => ({ ...section, rows: section.rows.slice(0, limit) })),
    notes: [...scope.notes, ...(input.cari ? ["Pencarian membatasi rincian. Ringkasan tetap memakai cakupan periode dan filter laporan."] : []), ...(truncated ? [`Setiap bagian menampilkan maksimal ${limit} baris. Persempit periode atau filter untuk melihat rincian lainnya.`] : [])],
  };
}

async function operations(headers: Headers, period: Period, input: ReportInput, db: ReturnType<typeof database>) {
  if (input.transaksi) throw new ServiceError("invalid", "Filter jenis transaksi hanya berlaku untuk laporan kas atau reseller.");
  if (input.kategori === "campur") throw new ServiceError("invalid", "Kategori Campuran digunakan pada laporan reseller.");
  const scope = { ...period, barnId: input.kandang, flockId: input.kelompok };
  const [population, measures, feed, feedDetails, eggDetails] = await Promise.all([
    populationDashboard(headers, scope, db),
    productionSummary(headers, scope, db),
    feedProjection(db, period.to, undefined, period.from),
    feedView(headers, period, db),
    eggView(headers, period, db),
  ]);
  const barn = population.barnRows.find(({ id }) => id === input.kandang);
  const flock = population.flockRows.find(({ id }) => id === input.kelompok);
  if ((input.kandang && !barn) || (input.kelompok && !flock)) throw new ServiceError("not-found", "Kandang atau kelompok tidak ditemukan.");
  const last = population.timeline.at(-1)!;
  const selected = input.kategori as Category | undefined;
  const sections: ReportSection[] = [{
    title: "Populasi, panen, dan konsumsi per hari",
    columns: ["Tanggal", "Ternak akhir", "Mati", "Transfer", "Panen butir", "Berat panen", "Konsumsi pakan"],
    rows: population.timeline.map((row) => [
      formatDate(row.day), row.known ? qty(row.hens) : unavailable, row.known ? qty(row.deaths) : unavailable,
      row.known ? qty(row.transfers) : unavailable, row.recorded && !(input.kelompok && row.mixed) ? qty(row.eggs) : unavailable,
      input.kelompok && row.mixed ? unavailable : mass(row.measuredGrams), mass(input.kelompok ? null : feedConsumedForBarns(feed, row.day, row.activeBarnIds)),
    ]),
  }];
  const notes = [
    "Angka akhir hari memakai tanggal operasional WIB dan koreksi yang sudah disetujui.",
    "HDP memakai populasi akhir hari. HHP memakai jumlah awal kelompok pada hari yang dapat dihitung. Panen campuran tidak dialokasikan ke kelompok.",
    "FCR memakai konsumsi dari pengukuran sisa dan berat aktual seluruh panen termasuk Cacat. Kolom yang belum terukur ditandai Data belum lengkap.",
  ];
  const farmWide = !input.kandang && !input.kelompok;
  if (!input.kelompok) {
    const findProduct = (id: string) => feedDetails.products.find((row) => row.id === id)?.name ?? "Pakan";
    const findBarn = (id: string) => feedDetails.barns.find((row) => row.id === id)?.name ?? "Kandang";
    const feedRows = feedDetails.events.filter((event) => !event.reversed).flatMap((event) => {
      if (event.kind === "feed_purchase" && event.purchase && farmWide) {
        return [[formatDate(event.day), "Pakan masuk", findProduct(event.purchase.productId), "Gudang", mass(event.purchase.grams)]];
      }
      return event.kind === "feed_issue" ? event.moves.filter((move) => move.barnId && (!input.kandang || move.barnId === input.kandang)).map((move) => [
        formatDate(event.day), "Pakan keluar", findProduct(move.productId), findBarn(move.barnId!), mass(move.grams),
      ]) : [];
    });
    sections.push({ title: "Penerimaan dan distribusi pakan", columns: ["Tanggal", "Kegiatan", "Pakan", "Lokasi", "Berat"], rows: feedRows });
    sections.push({
      title: "Pengukuran sisa harian", columns: ["Tanggal", "Kandang", "Pakan", "Sisa terukur", "Dikonsumsi"],
      rows: feed.daily.filter((row) => row.day >= period.from && (!input.kandang || row.barnId === input.kandang)).map((row) => [
        formatDate(row.day), findBarn(row.barnId), findProduct(row.productId), mass(row.closing), row.stale ? "Perlu verifikasi ulang" : mass(row.consumed),
      ]),
    });
  }
  const sorted = sortedCategories.filter((key) => !selected || selected === key);
  const gradingRows = eggDetails.events.filter((event) => event.kind === "egg_grading" && event.effective && event.grading)
    .flatMap((event) => {
      const lot = eggDetails.harvests.find(({ id }) => id === event.grading!.harvestId);
      if (!lot || (input.kandang && lot.barnId !== input.kandang) || (input.kelompok && lot.flockId !== input.kelompok)) return [];
      const grouped = { coklat: event.grading!.brown, putih: event.grading!.white, cacat: event.grading!.defective };
      return sorted.filter((key) => grouped[key] > 0).map((key) => [formatDate(event.day), formatDate(lot.day), categoryLabels[key], qty(grouped[key])]);
    });
  sections.push({ title: "Sortir menurut lot panen", columns: ["Tanggal sortir", "Tanggal panen", "Kategori", "Butir"], rows: gradingRows });
  if (farmWide) {
    const categories = ["ungraded", ...sortedCategories] as const;
    sections.push({
      title: "Persediaan telur pada akhir periode", columns: ["Kategori", "Butir"],
      rows: categories.filter((key) => !selected || selected === key).map((key) => [categoryLabels[key], qty(eggDetails.stock.balances[key])]),
    });
  } else {
    notes.push("Persediaan telur dikelola terpusat. Gunakan cakupan seluruh farm untuk melihat saldo kategori gudang.");
  }
  if (selected) notes.push("Filter kategori berlaku pada rincian sortir dan persediaan. Jumlah panen tetap mencakup seluruh hasil.");
  return {
    criteria: [`Kandang: ${barn?.label ?? "Semua"}`, `Kelompok: ${flock?.label ?? "Semua"}`, `Kategori telur: ${selected ? categoryLabels[selected] : "Semua"}`],
    metrics: [
      { label: "Ternak akhir periode", value: last.known ? `${qty(last.hens)} ekor` : unavailable },
      { label: "HDP", value: nullable(population.rates.hdp, "%"), detail: `${population.rates.measuredDays} hari terukur` },
      { label: "HHP", value: input.kelompok ? nullable(population.rates.hhp, "%") : "Pilih kelompok" },
      { label: "Berat panen", value: mass(measures.eggGrams) },
      { label: "Konsumsi pakan", value: mass(measures.feedGrams) },
      { label: "FCR", value: nullable(measures.fcr, ""), detail: "Kg pakan per kg telur" },
    ], sections, notes,
  };
}

async function farmFinance(headers: Headers, period: Period, input: ReportInput, db: ReturnType<typeof database>) {
  if (input.kategori) throw new ServiceError("invalid", "Filter kategori telur hanya berlaku untuk laporan operasional dan reseller.");
  const sources: Record<string, string> = { feed_purchase: "Pembelian pakan", egg_sale: "Penjualan telur", cash_manual: "Kas mandiri", cash_opening: "Saldo awal", reversal: "Pembalik" };
  const data = await financeView(headers, period, db);
  const rows = data.rows.filter(({ direction }) => !input.transaksi || input.transaksi === direction).map((row) => [
    formatDate(row.date), cashFilterLabels[row.direction], row.category, sources[row.origin] ?? "Kas farm",
    money(row.delta), row.effective ? "Tercatat" : "Dibatalkan", row.note || "-",
  ]);
  return {
    criteria: [`Jenis transaksi: ${input.transaksi ? cashFilterLabels[input.transaksi] : "Semua"}`],
    metrics: [
      { label: "Saldo sebelum periode", value: money(data.starting) }, { label: "Pemasukan", value: money(data.income) },
      { label: "Pengeluaran", value: money(data.expense) }, { label: "Saldo akhir kas", value: money(data.balance) },
    ],
    sections: [{ title: "Buku kas farm", columns: ["Tanggal", "Jenis", "Kategori", "Sumber", "Jumlah", "Status", "Catatan"], rows }],
    notes: ["Ringkasan mencakup semua transaksi kas dalam cakupannya. Filter jenis berlaku untuk tabel rincian.",
      "Saldo awal ditampilkan terpisah dari pemasukan. Buku kas mencatat saldo dan arus kas."],
  };
}

async function resellerReport(headers: Headers, period: Period, input: ReportInput, db: ReturnType<typeof database>) {
  if (input.kategori === "ungraded") throw new ServiceError("invalid", "Pilih kategori dalam ruang reseller.");
  const data = await resellerView(headers, period, db);
  const rows = data.events.filter((event) => (!input.kategori || event.stock?.category === input.kategori)
    && (!input.transaksi || event.cash?.direction === input.transaksi)).map((event) => [
    formatDate(event.day), event.stock ? category(event.stock.category) : event.cash?.category ?? "Kas",
    event.stock ? qty(event.stock.deltaPieces) : "-", event.stock?.actualGrams ? mass(event.stock.actualGrams) :
      event.stock?.piecesPerUnit ? `${event.stock.unitCount} x ${event.stock.piecesPerUnit} butir` : "-",
    event.cash ? money(event.cash.deltaIdr) : "-", event.active ? "Tercatat" : "Dibatalkan", event.note || "-",
  ]);
  return {
    criteria: [`Kategori: ${input.kategori ? category(input.kategori) : "Semua"}`, `Jenis kas: ${input.transaksi ? cashFilterLabels[input.transaksi] : "Semua"}`],
    metrics: [
      { label: "Pemasukan", value: money(data.finance.income) }, { label: "Pengeluaran", value: money(data.finance.expense) },
      { label: "Saldo akhir kas", value: money(data.finance.balance) },
    ],
    sections: [
      { title: "Saldo stok reseller", columns: ["Kategori", "Butir"], rows: categories.filter((key) => !input.kategori || key === input.kategori).map((key) => [category(key), qty(data.balances[key])]) },
      { title: "Pergerakan stok dan kas", columns: ["Tanggal", "Kategori", "Butir", "Kemasan atau berat", "Kas", "Status", "Catatan"], rows },
      { title: "Versi satuan kemasan", columns: ["Sejak", "Kode", "Satuan", "Butir per kemasan", "Versi"],
        rows: data.units.map((unit) => [formatDate(unit.effectiveDate), unit.code, unit.name, qty(unit.piecesPerUnit), qty(unit.revision)]) },
    ],
    notes: ["Catatan berasal dari ruang reseller pemilik sesi. Faktor satuan pada transaksi mengikuti versi saat pencatatan.",
      "Ringkasan kas mencakup seluruh transaksi pada periode. Berat kilogram ditampilkan dari timbangan dan dicatat terpisah dari jumlah butir."],
  };
}

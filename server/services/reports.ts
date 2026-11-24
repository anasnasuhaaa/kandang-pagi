import { database } from "../../db";
import { barns, flocks } from "../../db/schema";
import { categoryLabels, sortedCategories, type Category } from "../../lib/domain/production-input";
import { cashFilterLabels, reportNames, reportPeriod, reportQuerySchema, reportCell as cell, reportBadge, reportSection, selectReportRows, type ReportData, type ReportInput, type ReportSection } from "../../lib/domain/report";
import { categories, resellerCategoryLabels, type ResellerCategory } from "../../lib/domain/reseller";
import { tableColumn as col } from "../../lib/domain/table-sort";
import { eggPresentation, recordStatus, statusPresentation } from "../../lib/status-presentation";
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
  const groups = scope.sections.map((section) => selectReportRows(section,
    (row) => !needle || row.join(" ").toLocaleLowerCase("id-ID").includes(needle), limit));
  const truncated = groups.some((group) => group.truncated);
  return {
    ...base, ...scope, criteria: [...scope.criteria, ...(input.cari ? [`Pencarian rincian: ${input.cari}`] : [])],
    sections: groups.map(({ section }) => section),
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
  const sections: ReportSection[] = [reportSection("Populasi, panen, dan konsumsi per hari", [
    col("date", "Tanggal", "date"), col("hens", "Ternak akhir", "number"), col("deaths", "Mati", "number"),
    col("transfers", "Transfer", "number"), col("eggs", "Panen butir", "number"), col("weight", "Berat panen", "number"),
    col("feed", "Konsumsi pakan", "number"),
  ], population.timeline.map((row) => {
    const recorded = row.recorded && !(input.kelompok && row.mixed);
    const weighed = input.kelompok && row.mixed ? null : row.measuredGrams;
    const consumed = input.kelompok ? null : feedConsumedForBarns(feed, row.day, row.activeBarnIds);
    return { id: row.day, cells: [
      cell(row.day, formatDate(row.day)),
      cell(row.known ? row.hens : null, row.known ? qty(row.hens) : unavailable),
      cell(row.known ? row.deaths : null, row.known ? qty(row.deaths) : unavailable),
      cell(row.known ? row.transfers : null, row.known ? qty(row.transfers) : unavailable),
      cell(recorded ? row.eggs : null, recorded ? qty(row.eggs) : unavailable),
      cell(weighed, mass(weighed)), cell(consumed, mass(consumed)),
    ] };
  }))];
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
        return [{ id: event.id, cells: [
          cell(event.day, formatDate(event.day)), "Pakan masuk", findProduct(event.purchase.productId), "Gudang",
          cell(event.purchase.grams, mass(event.purchase.grams)),
        ] }];
      }
      return event.kind === "feed_issue" ? event.moves.filter((move) => move.barnId && (!input.kandang || move.barnId === input.kandang)).map((move) => ({
        id: `${event.id}:${move.productId}:${move.barnId}`,
        cells: [cell(event.day, formatDate(event.day)), "Pakan keluar", findProduct(move.productId), findBarn(move.barnId!), cell(move.grams, mass(move.grams))],
      })) : [];
    });
    sections.push(reportSection("Penerimaan dan distribusi pakan", [
      col("date", "Tanggal", "date"), col("event", "Kegiatan"), col("product", "Pakan", "wrap"),
      col("location", "Lokasi", "wrap"), col("weight", "Berat", "number"),
    ], feedRows));
    sections.push(reportSection("Pengukuran sisa harian", [
      col("date", "Tanggal", "date"), col("barn", "Kandang", "wrap"), col("product", "Pakan", "wrap"),
      col("closing", "Sisa terukur", "number"), col("consumed", "Dikonsumsi", "number"),
    ], feed.daily.filter((row) => row.day >= period.from && (!input.kandang || row.barnId === input.kandang)).map((row) => ({
      id: `${row.day}:${row.barnId}:${row.productId}`, cells: [
        cell(row.day, formatDate(row.day)), findBarn(row.barnId), findProduct(row.productId), cell(row.closing, mass(row.closing)),
        cell(row.stale ? null : row.consumed, row.stale ? "Perlu verifikasi ulang" : mass(row.consumed)),
      ],
    }))));
  }
  const sorted = sortedCategories.filter((key) => !selected || selected === key);
  const gradingRows = eggDetails.events.filter((event) => event.kind === "egg_grading" && event.effective && event.grading)
    .flatMap((event) => {
      const lot = eggDetails.harvests.find(({ id }) => id === event.grading!.harvestId);
      if (!lot || (input.kandang && lot.barnId !== input.kandang) || (input.kelompok && lot.flockId !== input.kelompok)) return [];
      const grouped = { coklat: event.grading!.brown, putih: event.grading!.white, cacat: event.grading!.defective };
      return sorted.filter((key) => grouped[key] > 0).map((key) => ({ id: `${event.id}:${key}`, cells: [
        cell(event.day, formatDate(event.day)), cell(lot.day, formatDate(lot.day)), reportBadge(eggPresentation[key]), cell(grouped[key], qty(grouped[key])),
      ] }));
    });
  sections.push(reportSection("Sortir menurut lot panen", [
    col("graded", "Tanggal sortir", "date"), col("harvest", "Tanggal panen", "date"), col("category", "Kategori"), col("pieces", "Butir", "number"),
  ], gradingRows));
  if (farmWide) {
    const categories = ["ungraded", ...sortedCategories] as const;
    sections.push(reportSection("Persediaan telur pada akhir periode", [col("category", "Kategori"), col("pieces", "Butir", "number")],
      categories.filter((key) => !selected || selected === key).map((key) => ({
        id: key, cells: [reportBadge(eggPresentation[key]), cell(eggDetails.stock.balances[key], qty(eggDetails.stock.balances[key]))],
      }))));
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
  const rows = data.rows.filter(({ direction }) => !input.transaksi || input.transaksi === direction).map((row) => ({ id: row.id, cells: [
    cell(row.date, formatDate(row.date)), cashFilterLabels[row.direction], row.category, sources[row.origin] ?? "Kas farm",
    cell(row.delta, money(row.delta)), reportBadge(recordStatus(Boolean(row.effective))), cell(row.note || null, row.note || "-"),
  ] }));
  return {
    criteria: [`Jenis transaksi: ${input.transaksi ? cashFilterLabels[input.transaksi] : "Semua"}`],
    metrics: [
      { label: "Saldo sebelum periode", value: money(data.starting) }, { label: "Pemasukan", value: money(data.income) },
      { label: "Pengeluaran", value: money(data.expense) }, { label: "Saldo akhir kas", value: money(data.balance) },
    ],
    sections: [reportSection("Buku kas farm", [
      col("date", "Tanggal", "date"), col("direction", "Jenis"), col("category", "Kategori", "wrap"), col("source", "Sumber", "wrap"),
      col("amount", "Jumlah", "number"), col("status", "Status"), col("note", "Catatan", "wrap"),
    ], rows)],
    notes: ["Ringkasan mencakup semua transaksi kas dalam cakupannya. Filter jenis berlaku untuk tabel rincian.",
      "Saldo awal ditampilkan terpisah dari pemasukan. Buku kas mencatat saldo dan arus kas."],
  };
}

async function resellerReport(headers: Headers, period: Period, input: ReportInput, db: ReturnType<typeof database>) {
  if (input.kategori === "ungraded") throw new ServiceError("invalid", "Pilih kategori dalam ruang reseller.");
  const data = await resellerView(headers, period, db);
  const rows = data.events.filter((event) => (!input.kategori || event.stock?.category === input.kategori)
    && (!input.transaksi || event.cash?.direction === input.transaksi)).map((event) => {
    const stock = event.stock;
    const measured = stock?.actualGrams ? cell({ unit: "kg", amount: stock.actualGrams }, mass(stock.actualGrams)) :
      stock?.piecesPerUnit ? cell({ unit: "kemasan", amount: stock.unitCount ?? 0 }, `${stock.unitCount} x ${stock.piecesPerUnit} butir`) :
        cell(null, "-");
    return { id: event.id, cells: [
      cell(event.day, formatDate(event.day)), stock ? reportBadge(stock.category === "campur" ? { label: "Campuran", tone: "info" } : statusPresentation(eggPresentation, stock.category)) : event.cash?.category ?? "Kas",
      cell(stock?.deltaPieces, stock ? qty(stock.deltaPieces) : "-"), measured,
      cell(event.cash?.deltaIdr, event.cash ? money(event.cash.deltaIdr) : "-"),
      reportBadge(recordStatus(Boolean(event.active))), cell(event.note || null, event.note || "-"),
    ] };
  });
  return {
    criteria: [`Kategori: ${input.kategori ? category(input.kategori) : "Semua"}`, `Jenis kas: ${input.transaksi ? cashFilterLabels[input.transaksi] : "Semua"}`],
    metrics: [
      { label: "Pemasukan", value: money(data.finance.income) }, { label: "Pengeluaran", value: money(data.finance.expense) },
      { label: "Saldo akhir kas", value: money(data.finance.balance) },
    ],
    sections: [
      reportSection("Saldo stok reseller", [col("category", "Kategori"), col("pieces", "Butir", "number")],
        categories.filter((key) => !input.kategori || key === input.kategori).map((key) => ({
          id: key, cells: [reportBadge(key === "campur" ? { label: "Campuran", tone: "info" } : eggPresentation[key]), cell(data.balances[key], qty(data.balances[key]))],
        }))),
      reportSection("Pergerakan stok dan kas", [
        col("date", "Tanggal", "date"), col("category", "Kategori", "wrap"), col("pieces", "Butir", "number"),
        col("unit", "Kemasan atau berat"), col("cash", "Kas", "number"), col("status", "Status"), col("note", "Catatan", "wrap"),
      ], rows),
      reportSection("Versi satuan kemasan", [
        col("effective", "Sejak", "date"), col("code", "Kode"), col("unit", "Satuan", "wrap"),
        col("factor", "Butir per kemasan", "number"), col("version", "Versi", "number"),
      ], data.units.map((unit) => ({ id: unit.id, cells: [
        cell(unit.effectiveDate, formatDate(unit.effectiveDate)), unit.code, unit.name,
        cell(unit.piecesPerUnit, qty(unit.piecesPerUnit)), cell(unit.revision, qty(unit.revision)),
      ] }))),
    ],
    notes: ["Catatan berasal dari ruang reseller pemilik sesi. Faktor satuan pada transaksi mengikuti versi saat pencatatan.",
      "Ringkasan kas mencakup seluruh transaksi pada periode. Berat kilogram ditampilkan dari timbangan dan dicatat terpisah dari jumlah butir."],
  };
}

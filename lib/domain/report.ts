import { z } from "zod";
import type { DataColumn, SortValue } from "./table-sort";
import { businessDateSchema, uuidSchema } from "../validation";
import { businessDate, shiftBusinessDate } from "../format";

export const reportFamilies = ["operasional", "keuangan", "reseller"] as const;
export type ReportFamily = (typeof reportFamilies)[number];
export const reportNames = { operasional: "Operasional farm", keuangan: "Keuangan farm", reseller: "Usaha reseller" };
export const reportCategories = ["ungraded", "coklat", "putih", "cacat", "campur"] as const;
export const cashFilters = ["opening", "income", "expense", "reversal"] as const;
export const cashFilterLabels = { opening: "Saldo awal", income: "Pemasukan", expense: "Pengeluaran", reversal: "Pembalik" };

const choice = <T>(schema: z.ZodType<T>) => z.union([z.literal("").transform(() => undefined), schema]).optional();
export const reportQuerySchema = z.object({
  jenis: choice(z.enum(reportFamilies)),
  mulai: choice(businessDateSchema),
  akhir: choice(businessDateSchema),
  kandang: choice(uuidSchema),
  kelompok: choice(uuidSchema),
  kategori: choice(z.enum(reportCategories)),
  transaksi: choice(z.enum(cashFilters)),
  cari: z.string().trim().max(100, "Gunakan maksimal 100 karakter.").optional(),
}).superRefine(({ mulai, akhir }, context) => {
  const end = akhir ?? businessDate();
  if (end > businessDate() || (mulai && (mulai > end || mulai < shiftBusinessDate(end, -89)))) {
    context.addIssue({ code: "custom", path: ["mulai"], message: "Pilih rentang berurutan, maksimal 90 hari sampai hari ini di WIB." });
  }
});

export type ReportInput = z.infer<typeof reportQuerySchema>;
export type ReportSection = {
  title: string;
  columns: string[];
  rows: string[][];
  tableColumns: DataColumn[];
  rowMeta: { id: string; values: SortValue[] }[];
};

type ReportCell = string | { value: SortValue; text: string };

export function reportCell(value: SortValue, text: string): ReportCell {
  return { value, text };
}

export function reportSection(title: string, tableColumns: DataColumn[], rows: { id: string; cells: ReportCell[] }[]): ReportSection {
  return {
    title, tableColumns,
    columns: tableColumns.map(({ label }) => label),
    rows: rows.map(({ cells }) => cells.map((cell) => typeof cell === "string" ? cell : cell.text)),
    rowMeta: rows.map(({ id, cells }) => ({ id, values: cells.map((cell) => typeof cell === "string" ? cell : cell.value) })),
  };
}

export function selectReportRows(section: ReportSection, matches: (row: string[]) => boolean, limit: number) {
  const indices = section.rows.flatMap((row, index) => matches(row) ? [index] : []);
  const visible = indices.slice(0, limit);
  return {
    section: { ...section, rows: visible.map((index) => section.rows[index]), rowMeta: visible.map((index) => section.rowMeta[index]) },
    truncated: indices.length > limit,
  };
}
export type ReportData = {
  family: ReportFamily;
  title: string;
  from: string;
  to: string;
  generatedAt: Date;
  criteria: string[];
  metrics: { label: string; value: string; detail?: string }[];
  sections: ReportSection[];
  notes: string[];
};

export function reportPeriod(input: ReportInput, today = businessDate()) {
  const to = input.akhir ?? today;
  return { from: input.mulai ?? shiftBusinessDate(to, -29), to };
}

import { z } from "zod";
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
export type ReportSection = { title: string; columns: string[]; rows: string[][] };
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

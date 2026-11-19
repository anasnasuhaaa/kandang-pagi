import { z } from "zod";
import { businessDate } from "../format";
import { businessDateSchema, kilogramsSchema, nameSchema, rupiahSchema, uuidSchema } from "../validation";

export const transactionDate = businessDateSchema.refine((date) => date <= businessDate(), "Tanggal tidak boleh melewati hari ini di WIB.");
export const operationalNotes = z.string().trim().max(500, "Gunakan maksimal 500 karakter.").default("");
export const adjustmentReason = z.string().trim().min(3, "Masukkan alasan dengan minimal 3 karakter.").max(500, "Gunakan maksimal 500 karakter.");
export const requestKeySchema = z.uuid("Muat ulang formulir untuk memperoleh identitas permintaan.");
export const positiveKg = kilogramsSchema.refine((amount) => amount > 0, "Berat harus lebih besar dari nol.");
export const positiveIdr = rupiahSchema.refine((amount) => amount > BigInt(0), "Nilai harus lebih besar dari Rp0.");
export const optionalKg = z.union([z.literal("").transform(() => 0), kilogramsSchema]).default(0);
export const optionalDate = z.union([z.literal("").transform(() => undefined), businessDateSchema]).optional();
export const wholePieces = z.string().trim().regex(/^\d{1,8}$/, "Masukkan jumlah dalam bilangan bulat.").transform(Number);
export const positivePieces = wholePieces.refine((count) => count > 0, "Jumlah harus lebih besar dari nol.");
export const optionalId = z.union([z.literal("").transform(() => undefined), uuidSchema]).optional();
const balanceDirection = z.enum(["increase", "decrease"], { error: "Pilih arah penyesuaian." });

const dated = { requestKey: requestKeySchema, businessDate: transactionDate, note: operationalNotes };
const feed = { ...dated, productId: uuidSchema };
const barnFeed = { ...feed, barnId: uuidSchema };

export const productSchema = z.object({
  requestKey: requestKeySchema,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,23}$/, "Gunakan 2–24 huruf, angka, tanda hubung, atau garis bawah."),
  name: nameSchema,
  kind: z.enum(["ingredient", "complete", "mixed"], { error: "Pilih jenis pakan." }),
});
export const feedOpeningSchema = z.object({ ...feed, barnId: optionalId, grams: positiveKg, value: rupiahSchema, note: adjustmentReason });
export const feedPurchaseSchema = z.object({ ...feed, grams: positiveKg, total: positiveIdr, supplier: nameSchema });
export const feedIssueSchema = z.object({ ...barnFeed, grams: positiveKg });
export const feedClosingSchema = z.object({ ...barnFeed, closing: kilogramsSchema, waste: optionalKg, returned: optionalKg });
export const feedAdjustmentSchema = z.object({
  ...feed, barnId: optionalId, grams: positiveKg, direction: balanceDirection, note: adjustmentReason,
});
export const feedMixSchema = z.object({
  ...feed,
  output: positiveKg,
  ingredients: z.array(z.object({ productId: uuidSchema, grams: positiveKg })).min(2, "Gunakan minimal dua bahan.").max(12, "Gunakan maksimal 12 bahan."),
}).superRefine(({ output, ingredients, productId }, ctx) => {
  if (new Set(ingredients.map((it) => it.productId)).size !== ingredients.length || ingredients.some((it) => it.productId === productId)) {
    ctx.addIssue({ code: "custom", path: ["ingredients"], message: "Setiap bahan harus berbeda dan tidak boleh sama dengan hasil campuran." });
  }
  if (output > ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0)) {
    ctx.addIssue({ code: "custom", path: ["output"], message: "Berat hasil campuran tidak boleh melebihi total berat bahan." });
  }
});

const sorted = ["coklat", "putih", "cacat"] as const;
export const sortedCategorySchema = z.enum(sorted, { error: "Pilih kategori telur yang sudah disortir." });
export type SortedCategory = z.infer<typeof sortedCategorySchema>;
export type Category = SortedCategory | "ungraded";
export const categoryLabels: Record<Category, string> = { ungraded: "Belum Disortir", coklat: "Coklat", putih: "Putih", cacat: "Cacat" };
export const sortedCategories = sorted;
const harvest = {
  ...dated, barnId: uuidSchema, count: wholePieces,
  weighed: z.union([z.literal("").transform(() => null), kilogramsSchema]).default(null),
  massStatus: z.enum(["complete", "incomplete"], { error: "Pilih kelengkapan berat panen." }),
};
export const harvestSchema = z.discriminatedUnion("attribution", [
  z.object({ ...harvest, attribution: z.literal("flock"), flockId: uuidSchema }),
  z.object({ ...harvest, attribution: z.literal("mixed") }),
]).superRefine(({ count, weighed, massStatus, note }, ctx) => {
  if ((!count && (weighed !== 0 || massStatus !== "complete")) || (count > 0 && massStatus === "complete" && !weighed)) {
    ctx.addIssue({ code: "custom", path: ["weighed"], message: count ? "Masukkan berat aktual, atau tandai penimbangan belum lengkap." : "Isi berat 0 kg untuk panen nol butir." });
  }
  if (count && weighed === 0) ctx.addIssue({ code: "custom", path: ["weighed"], message: "Kosongkan berat jika telur belum dapat ditimbang." });
  if (massStatus === "incomplete" && !note) ctx.addIssue({ code: "custom", path: ["note"], message: "Jelaskan telur yang belum dapat ditimbang." });
});
export const gradingSchema = z.object({
  ...dated, harvestId: uuidSchema, coklat: wholePieces, putih: wholePieces, cacat: wholePieces,
}).refine((record) => sorted.some((category) => record[category] > 0), { path: ["coklat"], message: "Masukkan hasil sortir minimal satu butir." });
export const saleSchema = z.object({
  ...dated,
  buyer: z.string().trim().max(100, "Gunakan maksimal 100 karakter.").default(""),
  paid: positiveIdr,
  lines: z.array(z.object({ category: sortedCategorySchema, count: positivePieces, price: positiveIdr })).min(1, "Masukkan minimal satu baris penjualan.").max(3),
}).superRefine(({ lines, paid }, ctx) => {
  if (new Set(lines.map((item) => item.category)).size !== lines.length) {
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Gunakan satu baris untuk tiap kategori." });
  }
  if (lines.reduce((sum, line) => sum + BigInt(line.count) * line.price, BigInt(0)) !== paid) {
    ctx.addIssue({ code: "custom", path: ["paid"], message: "Pembayaran harus sama dengan total penjualan." });
  }
});
export const eggAdjustmentSchema = z.object({
  ...dated,
  category: z.enum(["ungraded", ...sorted], { error: "Pilih kategori yang valid." }),
  harvestId: optionalId,
  mode: z.enum(["opening", "loss", "increase", "decrease"], { error: "Pilih jenis penyesuaian." }),
  count: positivePieces,
  note: adjustmentReason,
}).refine(({ category, harvestId, mode }) => category !== "ungraded"
  ? !harvestId : Boolean(harvestId) && ["loss", "decrease"].includes(mode), {
  path: ["harvestId"], message: "Telur belum disortir memerlukan lot panen dan hanya dapat dikurangi.",
});

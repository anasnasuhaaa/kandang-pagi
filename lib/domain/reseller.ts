import { z } from "zod";
import { nameSchema, rupiahSchema, uuidSchema } from "../validation";
import { adjustmentReason, operationalNotes, positiveIdr, positiveKg, positivePieces, requestKeySchema, transactionDate } from "./production-input";

export const categories = ["campur", "coklat", "putih", "cacat"] as const;
export const resellerCategoryLabels = { campur: "Campuran", coklat: "Coklat", putih: "Putih", cacat: "Cacat" };
export type ResellerCategory = (typeof categories)[number];
const category = z.enum(categories, { error: "Pilih kategori telur." });
const unitCode = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,23}$/, "Gunakan 2–24 huruf, angka, tanda hubung, atau garis bawah.")
  .refine((value) => value !== "kg" && value !== "butir", "Kode kg dan butir sudah digunakan.");
const dated = { requestKey: requestKeySchema, businessDate: transactionDate, note: operationalNotes };
const transaction = { ...dated, category, amount: rupiahSchema };
const balanceDirection = z.enum(["increase", "decrease"], { error: "Pilih arah penyesuaian." });

export const unitDefinitionSchema = z.object({
  requestKey: requestKeySchema, businessDate: transactionDate, code: unitCode, name: nameSchema,
  piecesPerUnit: positivePieces,
  status: z.enum(["active", "inactive"], { error: "Pilih status satuan." }),
});
export const resellerTransactionSchema = z.discriminatedUnion("unit", [
  z.object({ ...transaction, unit: z.literal("pieces"), pieces: positivePieces }),
  z.object({ ...transaction, unit: z.literal("packaging"), unitId: uuidSchema, unitCount: positivePieces }),
  z.object({ ...transaction, unit: z.literal("kg"), weight: positiveKg, pieces: positivePieces }),
]);
export const resellerSaleSchema = resellerTransactionSchema.refine(({ amount }) => amount > BigInt(0), {
  path: ["amount"], message: "Masukkan jumlah pembayaran tunai yang diterima.",
});
export const resellerAdjustmentSchema = z.object({
  ...dated, category, pieces: positivePieces, mode: z.enum(["opening", "change"]), direction: balanceDirection, note: adjustmentReason,
});
export const resellerCashSchema = z.object({
  ...dated, category: nameSchema, amount: positiveIdr,
  direction: z.enum(["income", "expense"], { error: "Pilih jenis kas." }),
});
export const resellerCashOpeningSchema = z.object({ ...dated, amount: rupiahSchema, note: adjustmentReason });
export const resellerCancelSchema = z.object({ id: uuidSchema, requestKey: requestKeySchema, reason: adjustmentReason });

export class InvalidConversion extends Error {}

export function packagingPieces(count: number, factor: number) {
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(factor) || count <= 0 || factor <= 0) {
    throw new InvalidConversion("Jumlah kemasan dan faktor konversi harus berupa bilangan bulat positif.");
  }
  const pieces = count * factor;
  if (!Number.isSafeInteger(pieces)) throw new InvalidConversion("Jumlah butir hasil konversi terlalu besar.");
  return pieces;
}

export function resellerStockAmount(unit: "pieces" | "packaging" | "kg", pieces: number, amount?: number) {
  if (unit === "packaging") return packagingPieces(pieces, amount ?? 0);
  if (!Number.isSafeInteger(pieces) || pieces <= 0) throw new InvalidConversion("Catat jumlah butir yang sebenarnya.");
  if (unit === "kg" && (!amount || !Number.isSafeInteger(amount) || amount <= 0)) {
    throw new InvalidConversion("Catat berat aktual dan jumlah butir secara terpisah.");
  }
  return pieces;
}

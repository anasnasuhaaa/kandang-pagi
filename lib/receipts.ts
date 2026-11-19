import { z } from "zod";

export const receiptLimit = 2 * 1024 * 1024;
export const receiptMime = z.enum(["image/jpeg", "image/png", "image/webp"], { error: "Pilih gambar JPEG, PNG, atau WebP." });
export type ReceiptMime = z.infer<typeof receiptMime>;
export const receiptExtensions: Record<ReceiptMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function receiptFileError(mime: string, size: number) {
  if (!receiptMime.safeParse(mime).success) return "Pilih gambar JPEG, PNG, atau WebP.";
  if (size < 1 || size > receiptLimit) return "Ukuran gambar harus lebih dari 0 dan maksimal 2 MiB.";
  return null;
}

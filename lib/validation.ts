import { z } from "zod";

export const nameSchema = z.string().trim().min(2, "Masukkan minimal 2 karakter.").max(100, "Gunakan maksimal 100 karakter.");
export const emailSchema = z.string().trim().toLowerCase().max(254, "Alamat email terlalu panjang.").pipe(z.email("Masukkan alamat email yang valid."));
export const passwordSchema = z.string().min(12, "Gunakan minimal 12 karakter.").max(128, "Gunakan maksimal 128 karakter.");
export const businessDateSchema = z.iso.date("Masukkan tanggal yang valid.");
export const uuidSchema = z.uuid("Pilihan tidak valid.");

export const rupiahSchema = z.string().trim().transform((value) => value.replace(/^Rp\s*/i, ""))
  .pipe(z.string().regex(/^(?:[0-9]{1,15}|[0-9]{1,3}(?:\.[0-9]{3}){1,4})$/, "Masukkan rupiah dalam bilangan bulat."))
  .transform((value) => BigInt(value.replace(/\./g, "")));

export const kilogramsSchema = z.string().trim()
  .pipe(z.string().regex(/^\d{1,9}(?:[.,]\d{1,3})?$/, "Masukkan berat dalam kg dengan maksimal 3 angka desimal."))
  .transform((value) => {
    const [whole, fraction = ""] = value.split(/[.,]/);
    return Number(whole) * 1_000 + Number(fraction.padEnd(3, "0"));
  });

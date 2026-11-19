import { z } from "zod";
import { businessDate, shiftBusinessDate } from "../format";
import { businessDateSchema, nameSchema, uuidSchema } from "../validation";

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,23}$/, "Kode harus berisi 2–24 huruf, angka, tanda hubung, atau garis bawah.");
const note = z.string().trim().max(500, "Gunakan maksimal 500 karakter.");
const reason = z.string().trim().min(3, "Masukkan alasan dengan minimal 3 karakter.").max(500, "Gunakan maksimal 500 karakter.");
const pastDate = businessDateSchema.refine((value) => value <= businessDate(), "Tanggal tidak boleh melewati hari ini di WIB.");
const whole = z.string().trim().regex(/^\d{1,7}$/, "Masukkan jumlah dalam bilangan bulat.").transform(Number);
const positive = whole.refine((value) => value > 0, "Jumlah harus lebih besar dari nol.");
const requestKey = z.uuid("Muat ulang formulir untuk memperoleh identitas permintaan.");

export const barnSchema = z.object({ requestKey, code, name: nameSchema, location: note });
export const barnStatusSchema = z.object({ barnId: uuidSchema, active: z.boolean(), reason });
export const flockSchema = z.object({
  requestKey, code, name: nameSchema, barnId: uuidSchema,
  kind: z.enum(["opening", "arrival"], { error: "Pilih jenis penempatan." }),
  businessDate: pastDate, count: positive, age: whole, origin: nameSchema, reason,
});

export const movementSchema = z.discriminatedUnion("kind", [
  z.object({ requestKey, businessDate: pastDate, flockId: uuidSchema, kind: z.literal("transfer"), toBarnId: uuidSchema, reason }),
  z.object({ requestKey, businessDate: pastDate, flockId: uuidSchema, kind: z.enum(["death", "cull", "exit"], { error: "Pilih jenis mutasi." }), count: positive, reason }),
]);

export const cancelMovementSchema = z.object({ requestKey, eventId: uuidSchema, reason });

export const movementLabels = {
  opening: "Saldo awal", arrival: "Kedatangan", death: "Kematian",
  cull: "Afkir", exit: "Keluar", transfer: "Pindah kandang",
};

export const periodSchema = z.object({
  mulai: businessDateSchema.optional().catch(undefined),
  akhir: businessDateSchema.optional().catch(undefined),
  kandang: uuidSchema.optional().catch(undefined),
  kelompok: uuidSchema.optional().catch(undefined),
});

export function populationPeriod(raw: unknown, defaults = 7) {
  const values = periodSchema.parse(raw);
  const today = businessDate();
  const to = values.akhir && values.akhir <= today ? values.akhir : today;
  const earliest = shiftBusinessDate(to, -89);
  const from = values.mulai && values.mulai <= to && values.mulai >= earliest ? values.mulai : shiftBusinessDate(to, 1 - defaults);
  return { from, to, barnId: values.kandang, flockId: values.kelompok };
}

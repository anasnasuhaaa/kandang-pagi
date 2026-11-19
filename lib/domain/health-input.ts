import { z } from "zod";
import { accountIdSchema } from "../account-validation";
import { businessDateSchema, nameSchema, uuidSchema } from "../validation";
import { adjustmentReason, operationalNotes, optionalId, requestKeySchema, transactionDate } from "./production-input";

const observation = z.string().trim().min(3, "Masukkan minimal 3 karakter.").max(1_500, "Gunakan maksimal 1.500 karakter.");
const staff = z.union([z.literal("").transform(() => undefined), accountIdSchema]).optional();
const location = { barnId: uuidSchema, flockId: optionalId };
const base = { requestKey: requestKeySchema, businessDate: transactionDate, note: operationalNotes };
export const healthStatusSchema = z.enum(["open", "monitoring", "resolved"], { error: "Pilih status kesehatan." });
export const incidentSchema = z.object({
  ...base, ...location, incident: nameSchema, observations: observation,
  treatment: operationalNotes, responsibleId: staff, status: healthStatusSchema,
});
export const updateHealthSchema = z.object({ id: uuidSchema, status: healthStatusSchema, reason: adjustmentReason });
export const vaccinationSchema = z.object({
  ...base, ...location, vaccine: nameSchema, dueDate: businessDateSchema,
}).refine((values) => values.dueDate >= values.businessDate, { path: ["dueDate"], message: "Jadwal tidak boleh lebih awal dari tanggal pencatatan." });
export const vaccinationExecutionSchema = z.object({
  ...base, scheduleId: uuidSchema, performerId: staff, outcome: observation,
});
export const quarantineSchema = z.object({
  ...base, barnId: uuidSchema, flockId: uuidSchema, note: adjustmentReason,
});
export const endQuarantineSchema = z.object({ id: uuidSchema, businessDate: transactionDate, reason: adjustmentReason });

export function vaccinationStatus(due: string, completed: boolean, asOf: string): "done" | "overdue" | "today" | "upcoming" {
  if (completed) return "done";
  if (due < asOf) return "overdue";
  if (due === asOf) return "today";
  return "upcoming";
}

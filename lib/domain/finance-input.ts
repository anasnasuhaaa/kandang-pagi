import { z } from "zod";
import { kilogramsSchema, nameSchema, rupiahSchema, uuidSchema } from "../validation";
import { adjustmentReason, operationalNotes, positiveIdr, requestKeySchema, transactionDate, wholePieces } from "./production-input";

export const cashOpeningSchema = z.object({
  requestKey: requestKeySchema, businessDate: transactionDate, amount: rupiahSchema, note: adjustmentReason,
});
export const manualCashSchema = z.object({
  requestKey: requestKeySchema, businessDate: transactionDate, amount: positiveIdr, category: nameSchema, note: operationalNotes,
  direction: z.enum(["income", "expense"], { error: "Pilih jenis transaksi." }),
});
export const correctionInputSchema = z.object({
  id: uuidSchema, requestKey: requestKeySchema, reason: adjustmentReason,
  proposed: z.enum(["cancel", "amount", "count", "closing"], { error: "Pilih bentuk koreksi." }),
  count: wholePieces.optional(),
  amount: positiveIdr.optional(),
  closing: kilogramsSchema.optional(),
}).superRefine((values, ctx) => {
  if (values.proposed === "count" && !values.count) ctx.addIssue({ code: "custom", path: ["count"], message: "Masukkan jumlah pengganti yang lebih besar dari nol." });
  if (values.proposed === "closing" && values.closing === undefined) ctx.addIssue({ code: "custom", path: ["closing"], message: "Masukkan sisa pakan yang terukur." });
  if (values.proposed === "amount" && !values.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Masukkan nilai pengganti." });
});
export const correctionReviewSchema = z.object({
  id: uuidSchema, requestKey: requestKeySchema, reason: adjustmentReason,
  outcome: z.enum(["approved", "rejected"], { error: "Pilih keputusan." }),
});

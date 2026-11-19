"use client";

import { LedgerFields, LedgerForm, amountField, selectField, textField, type Choice } from "@/components/inventory/ledger-form";
import { correctionInputSchema, correctionReviewSchema } from "@/lib/domain/finance-input";
import { directCorrectionAction, requestCorrectionAction, reviewCorrectionAction } from "@/server/services/workflow-actions";

export type CorrectionChoice = Choice & { modes: ("cancel" | "count" | "amount" | "closing")[] };
const options = {
  cancel: "Batalkan pencatatan", count: "Ganti jumlah mutasi", amount: "Ganti nilai kas", closing: "Ganti atau verifikasi sisa pakan",
};
export function CorrectionForm({ selected, choices, direct }: {
  selected?: CorrectionChoice; choices?: CorrectionChoice[]; direct: boolean;
}) {
  return <LedgerForm title={direct ? "Koreksi catatan" : "Ajukan koreksi"} description={direct
    ? "Catatan asli tetap ada. Sistem memeriksa dampak pada riwayat sebelum menyimpan."
    : "Ajukan perubahan untuk ditinjau Administrator."}
    fields={[...(selected ? [] : [selectField("id", "Catatan yang dikoreksi", choices ?? [])]), textField("reason", "Alasan koreksi")]}
    schema={correctionInputSchema} action={direct ? directCorrectionAction : requestCorrectionAction}
    prepare={(raw) => ({ ...raw, id: selected?.value ?? raw.id })}
    initial={{ proposed: "cancel" }}
    confirm={direct ? "Koreksi disimpan sebagai pembalik dan, bila diperlukan, catatan pengganti." : undefined}
    renderExtra={(errors, values, update) => {
      const choice = selected ?? choices?.find(({ value }) => value === values.id);
      const modes = choice?.modes ?? ["cancel"];
      return <LedgerFields fields={[
        selectField("proposed", "Bentuk koreksi", modes.map((mode) => ({ value: mode, label: options[mode as keyof typeof options] })), "cancel"),
        ...(values.proposed === "count" ? [amountField("count", "Jumlah pengganti (ekor)")] : []),
        ...(values.proposed === "amount" ? [amountField("amount", "Nilai pengganti (Rp)")] : []),
        ...(values.proposed === "closing" ? [amountField("closing", "Sisa terukur pengganti (kg)", undefined, true)] : []),
      ]} errors={errors} update={update} />;
    }} />;
}

export function ReviewCorrectionForm({ id }: { id: string }) {
  return <LedgerForm title="Tinjau permintaan" description="Periksa catatan, usulan, dan alasan sebelum menentukan keputusan."
    schema={correctionReviewSchema} action={reviewCorrectionAction} fields={[
      selectField("outcome", "Keputusan", [{ value: "approved", label: "Setujui" }, { value: "rejected", label: "Tolak" }]),
      textField("reason", "Alasan keputusan"),
    ]} prepare={(raw) => ({ ...raw, id })} confirm="Keputusan akan tercatat dalam riwayat koreksi." />;
}

"use client";

import { LedgerForm, dateField, selectField, textField, type Choice } from "@/components/inventory/ledger-form";
import {
  endQuarantineSchema, incidentSchema, quarantineSchema, updateHealthSchema, vaccinationExecutionSchema, vaccinationSchema,
} from "@/lib/domain/health-input";
import {
  addIncidentAction, addVaccinationAction, changeHealthStatusAction, endQuarantineAction,
  executeVaccinationAction, startQuarantineAction,
} from "@/server/services/workflow-actions";

type FormOptions = { today: string; barns: Choice[]; flocks: Choice[]; staff: Choice[] };
const states = [{ value: "open", label: "Terbuka" }, { value: "monitoring", label: "Dipantau" }, { value: "resolved", label: "Selesai" }];
const responsible = (staff: Choice[]) => [{ value: "", label: "Saya sendiri" }, ...staff];
const optionalFlock = (flocks: Choice[]) => [{ value: "", label: "Seluruh kandang" }, ...flocks];
const notes = textField("note", "Catatan (opsional)", "");

export function IncidentForm({ today, barns, flocks, staff }: FormOptions) {
  return <LedgerForm title="Catat kejadian kesehatan" description="Masukkan pengamatan dan tindakan yang sudah dilakukan."
    schema={incidentSchema} action={addIncidentAction} fields={[
      dateField(today), selectField("barnId", "Kandang", barns), selectField("flockId", "Kelompok", optionalFlock(flocks), ""),
      textField("incident", "Jenis kejadian"), textField("observations", "Gejala atau pengamatan"),
      textField("treatment", "Tindakan atau catatan penanganan (opsional)", ""),
      selectField("responsibleId", "Penanggung jawab", responsible(staff), ""), selectField("status", "Status", states, "open"), notes,
    ]} />;
}

export function IncidentStatusForm({ id, status }: { id: string; status: string }) {
  return <LedgerForm title="Perbarui status" description="Simpan perkembangan kejadian ke riwayat."
    schema={updateHealthSchema} action={changeHealthStatusAction} fields={[
      selectField("status", "Status terbaru", states, status), textField("reason", "Alasan atau perkembangan"),
    ]} prepare={(raw) => ({ ...raw, id })} />;
}

export function VaccinePlanForm({ today, barns, flocks }: Omit<FormOptions, "staff">) {
  return <LedgerForm title="Buat jadwal vaksin" description="Masukkan rencana vaksinasi sesuai jadwal yang sudah ditetapkan peternakan."
    schema={vaccinationSchema} action={addVaccinationAction} fields={[
      dateField(today), selectField("barnId", "Kandang", barns), selectField("flockId", "Kelompok", optionalFlock(flocks), ""),
      textField("vaccine", "Nama vaksin"), { name: "dueDate", label: "Tanggal jadwal (WIB)", type: "date", value: today }, notes,
    ]} />;
}

export function VaccineExecutionForm({ today, staff, schedules }: { today: string; staff: Choice[]; schedules: Choice[] }) {
  return <LedgerForm title="Catat pelaksanaan vaksin" description="Pilih jadwal lalu masukkan tanggal dan hasil pelaksanaan."
    schema={vaccinationExecutionSchema} action={executeVaccinationAction} fields={[
      dateField(today), selectField("scheduleId", "Jadwal vaksin", schedules),
      selectField("performerId", "Petugas", responsible(staff), ""), textField("outcome", "Hasil pelaksanaan"), notes,
    ]} />;
}

export function QuarantineForm({ today, barns, flocks }: Omit<FormOptions, "staff">) {
  return <LedgerForm title="Mulai karantina" description="Catat pengawasan isolasi untuk kelompok. Riwayat populasi tetap mengikuti mutasi ternak."
    schema={quarantineSchema} action={startQuarantineAction} fields={[
      dateField(today), selectField("barnId", "Kandang", barns), selectField("flockId", "Kelompok", flocks), textField("note", "Alasan karantina"),
    ]} />;
}

export function EndQuarantineForm({ id, today }: { id: string; today: string }) {
  return <LedgerForm title="Akhiri karantina" description="Tetapkan tanggal berakhir beserta catatan hasil pengawasan."
    schema={endQuarantineSchema} action={endQuarantineAction} fields={[dateField(today), textField("reason", "Alasan berakhir")]}
    prepare={(raw) => ({ ...raw, id })} />;
}

import { RowActions } from "@/components/shared/row-actions";
import { tableColumn as col, type DataColumn } from "@/components/shared/data-table";
import type { Metadata } from "next";
import { Activity, Shield, Syringe, TriangleAlert } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { EndQuarantineForm, IncidentForm, IncidentStatusForm, QuarantineForm, VaccineExecutionForm, VaccinePlanForm } from "@/components/health/entry-forms";
import { LedgerTable, ledgerBadge, ledgerCell, type LedgerRow } from "@/components/inventory/ledger-table";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { statusPresentation } from "@/components/shared/status-badge";
import { incidentPresentation, vaccinePresentation } from "@/lib/status-presentation";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessDate, formatDate } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { healthView } from "@/server/services/health";

export const metadata: Metadata = { title: "Kesehatan & Vaksin" };
const path = "/kesehatan";
const tabs = [
  { value: "kejadian", label: "Kejadian kesehatan" }, { value: "jadwal", label: "Jadwal vaksin" },
  { value: "pelaksanaan", label: "Pelaksanaan vaksin" }, { value: "karantina", label: "Karantina" },
];
const tabSchema = z.enum(["kejadian", "jadwal", "pelaksanaan", "karantina"]).catch("kejadian");
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type View = Awaited<ReturnType<typeof healthView>>;

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><HealthContent {...props} /></Suspense>;
}

async function HealthContent({ searchParams }: Props) {
  const actor = await requireModule("kesehatan");
  const raw = await searchParams;
  const query = ledgerQuery(raw);
  const tab = tabSchema.parse(raw.tab);
  const data = await healthView(await headers(), query);
  const operator = actor.role === "administrator" || actor.role === "abk";
  const today = businessDate();
  const barns = data.barns.filter(({ active }) => active).map(({ id, name }) => ({ value: id, label: name }));
  const flocks = data.flocks.map(({ id, name, code }) => ({ value: id, label: `${code} · ${name}` }));
  const staff = data.people.filter(({ status }) => status === "active").map(({ id, name }) => ({ value: id, label: name }));
  const schedules = data.schedules.filter(({ status }) => status !== "done").map((plan) => ({ value: plan.id, label: `${plan.vaccineName} · ${formatDate(plan.dueDate)}` }));
  const props = { today, barns, flocks, staff };
  const action = !operator ? null : tab === "kejadian" && barns.length ? <IncidentForm {...props} /> :
    tab === "jadwal" && barns.length ? <VaccinePlanForm {...props} /> :
    tab === "pelaksanaan" && schedules.length ? <VaccineExecutionForm today={today} staff={staff} schedules={schedules} /> :
    tab === "karantina" && barns.length && flocks.length ? <QuarantineForm {...props} /> : null;
  const { rows, columns } = healthRows(data, tab, query.from, operator, today);
  const filterOptions = tab === "jadwal" ? Object.entries(vaccinePresentation).map(([value, { label }]) => ({ value, label })) :
    tab === "kejadian" ? Object.entries(incidentPresentation).map(([value, { label }]) => ({ value, label })) : barns;
  const overdue = data.schedules.filter(({ status }) => status === "overdue").length;
  return <>
    <ModuleHeader title="Kesehatan & Vaksin" description="Pantau kejadian kesehatan, jadwal dan pelaksanaan vaksin, serta periode karantina." icon={Activity} />
    <ModuleTabs path={path} tab={tab} tabs={tabs} action={action} summary={
      <section aria-label="Ringkasan kesehatan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Kejadian aktif" value={data.incidents.filter(({ data }) => data.status !== "resolved").length} detail={formatDate(query.to)} />
        <MetricCard icon={Syringe} tone="info" label="Vaksin mendatang" value={data.schedules.filter(({ status }) => status === "upcoming" || status === "today").length} />
        <MetricCard icon={TriangleAlert} tone={overdue > 0 ? "danger" : "neutral"} label="Vaksin terlambat" value={overdue} />
        <MetricCard icon={Shield} label="Karantina aktif" value={data.quarantine.filter(({ active }) => active).length} detail={formatDate(query.to)} />
      </section>
    }>
      <LedgerTable path={path} tab={tab}
      label={tabs.find((item) => item.value === tab)!.label} rows={rows} columns={columns} query={query} choices={filterOptions} />
    </ModuleTabs>
  </>;
}

function healthRows(view: View, tab: z.infer<typeof tabSchema>, from: string, operator: boolean, today: string): { rows: LedgerRow[]; columns: DataColumn[] } {
  const barn = (id?: string) => view.barns.find((entry) => entry.id === id)?.name ?? "—";
  const flock = (id: string | null) => id ? view.flocks.find((entry) => entry.id === id)?.name ?? "—" : "Seluruh kandang";
  const staff = (id: string) => view.people.find((entry) => entry.id === id)?.name ?? "—";
  if (tab === "kejadian") return {
    columns: [col("date", "Tanggal", "date"), col("incident", "Kejadian", "wrap"), col("location", "Kandang dan kelompok", "wrap"), col("observations", "Pengamatan", "wrap"), col("treatment", "Penanganan", "wrap"), col("staff", "Petugas"), col("status", "Status")],
    rows: view.incidents.filter(({ day, data }) => day >= from || data.status !== "resolved").map(({ day, data, note }) => ({
      id: data.id, filter: data.status, search: [data.incident, barn(data.barnId), flock(data.flockId), data.observations, note].join(" "),
      cells: [ledgerCell(day, formatDate(day)), data.incident, `${barn(data.barnId)} · ${flock(data.flockId)}`,
        data.observations, ledgerCell(data.treatment || note || null, [data.treatment, note].filter(Boolean).join(" · ") || "—"), staff(data.responsibleId), ledgerBadge(statusPresentation(incidentPresentation, data.status))],
      actions: operator ? <RowActions actions={[{ id: "status", label: "Perbarui status", icon: "edit",
        content: <IncidentStatusForm id={data.id} status={data.status} /> }]} /> : undefined,
    })),
  };
  if (tab === "jadwal") return {
    columns: [col("due", "Jadwal", "date"), col("vaccine", "Vaksin", "wrap"), col("barn", "Kandang"), col("flock", "Kelompok"), col("status", "Status"), col("note", "Catatan", "wrap")],
    rows: view.schedules.filter((plan) => plan.dueDate >= from || plan.status !== "done").map((plan) => ({
      id: plan.id, filter: plan.status, search: [plan.vaccineName, barn(plan.barnId), flock(plan.flockId), plan.note].join(" "),
      cells: [ledgerCell(plan.dueDate, formatDate(plan.dueDate)), plan.vaccineName, barn(plan.barnId), flock(plan.flockId),
        ledgerBadge(statusPresentation(vaccinePresentation, plan.status)), ledgerCell(plan.note || null, plan.note || "—")],
    })),
  };
  if (tab === "pelaksanaan") return {
    columns: [col("date", "Tanggal", "date"), col("vaccine", "Vaksin", "wrap"), col("barn", "Kandang"), col("staff", "Petugas"), col("outcome", "Hasil", "wrap"), col("note", "Catatan", "wrap")],
    rows: view.runs.filter(({ day }) => day >= from).map(({ day, data, note }) => {
      const plan = view.schedules.find((row) => row.id === data.scheduleId);
      return {
        id: data.id, filter: plan?.barnId, search: [plan?.vaccineName, barn(plan?.barnId), staff(data.performerId), data.outcome, note].join(" "),
        cells: [ledgerCell(day, formatDate(day)), ledgerCell(plan?.vaccineName, plan?.vaccineName ?? "—"), barn(plan?.barnId), staff(data.performerId), data.outcome, ledgerCell(note || null, note || "—")],
      };
    }),
  };
  return {
    columns: [col("started", "Mulai", "date"), col("ended", "Berakhir", "date"), col("barn", "Kandang"), col("flock", "Kelompok"), col("reason", "Alasan", "wrap"), col("status", "Status")],
    rows: view.quarantine.filter(({ startedOn, endedOn }) => startedOn >= from || !endedOn || endedOn >= from).map((row) => ({
      id: row.id, filter: row.barnId, search: [barn(row.barnId), flock(row.flockId), row.reason].join(" "),
      cells: [ledgerCell(row.startedOn, formatDate(row.startedOn)), ledgerCell(row.endedOn, row.endedOn ? formatDate(row.endedOn) : "—"), barn(row.barnId), flock(row.flockId), row.reason,
        ledgerBadge(row.active ? { label: "Aktif", tone: "warning" } : { label: "Selesai", tone: "success" })],
      actions: operator && !row.endedOn ? <RowActions actions={[{ id: "end", label: "Akhiri karantina", icon: "check",
        content: <EndQuarantineForm id={row.id} today={today} /> }]} /> : undefined,
    })),
  };
}

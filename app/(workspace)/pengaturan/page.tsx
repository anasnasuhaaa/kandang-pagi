import type { Metadata } from "next";
import { Search, Settings, Users } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { CorrectionTable } from "@/components/finance/correction-table";
import { AccountControls, CreateAccountDialog } from "@/components/account/account-controls";
import { ProfileForms } from "@/components/account/profile-forms";
import { actionColumn, DataTable, DataTableRow, tableColumn as col } from "@/components/shared/data-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { PageLinks } from "@/components/shared/page-links";
import { StatusBadge, statusPresentation } from "@/components/shared/status-badge";
import { accountPresentation } from "@/lib/status-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import { accountAuditLabels } from "@/lib/account-audit-labels";
import { readTableSort, sortParams, type TableSort } from "@/lib/domain/table-sort";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessTimeZone } from "@/lib/format";
import { roleLabels } from "@/lib/roles";
import { listAccountAudit, listAccounts } from "@/server/auth/accounts";
import { requireModule } from "@/server/auth/workspace";

export const metadata: Metadata = { title: "Pengaturan" };

const path = "/pengaturan";
const accountColumns = [col("name", "Nama", "wrap"), col("email", "Email", "wrap"), col("role", "Peran"), col("status", "Status")];
const auditColumns = [col("recorded", "Waktu (WIB)", "date"), col("actor", "Pengguna", "wrap"), col("role", "Peran"), col("event", "Aktivitas", "wrap")];
const tabs = [
  { value: "profil", label: "Profil" }, { value: "akun", label: "Akun pengguna" }, { value: "audit", label: "Audit akun" }, { value: "koreksi", label: "Koreksi" },
];
const querySchema = z.object({
  tab: z.enum(["profil", "akun", "audit", "koreksi"]).catch("profil"),
  cari: z.string().trim().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});
const localDateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: businessTimeZone });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SettingsPage(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><SettingsContent {...props} /></Suspense>;
}

async function SettingsContent({ searchParams }: Props) {
  const actor = await requireModule("pengaturan");
  const raw = await searchParams;
  const params = querySchema.parse(raw);
  const sort = readTableSort(raw);
  const administrator = actor.role === "administrator";
  const operator = actor.role === "abk";
  const tab = administrator || (operator && params.tab === "koreksi") ? params.tab : "profil";
  const visibleTabs = administrator ? tabs : tabs.filter(({ value }) => value === "profil" || (operator && value === "koreksi"));
  return (
    <>
      <ModuleHeader title="Pengaturan" description="Kelola profil, tampilan, dan hak akses sesuai peran Anda." icon={Settings} />
      <ModuleTabs tab={tab} tabs={visibleTabs} path={path}>
        {tab === "profil" && <ProfileForms name={actor.name} email={actor.email} role={actor.role} theme={actor.theme} />}
        {tab === "akun" && <AccountsContent search={params.cari} page={params.halaman} ownId={actor.id} sort={sort} />}
        {tab === "audit" && <AuditContent page={params.halaman} sort={sort} />}
        {tab === "koreksi" && <CorrectionTable path={path} tab={tab} query={ledgerQuery(raw)} administrator={administrator} />}
      </ModuleTabs>
    </>
  );
}

async function AccountsContent({ search, page, ownId, sort }: { search: string; page: number; ownId: string; sort?: TableSort }) {
  const currentSort = accountColumns.some(({ key }) => key === sort?.column) ? sort : undefined;
  const { rows, total, pages, current, pageSize } = await listAccounts(await headers(), search, page, undefined, currentSort);
  const query = { tab: "akun", cari: search };
  const hasActions = rows.some(({ id }) => id !== ownId);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><MetricCard icon={Users} label={search ? "Hasil pencarian" : "Total akun"} value={total} /></div>
      <DataTable label="Akun pengguna"
        columns={hasActions ? [...accountColumns, actionColumn] : accountColumns}
        sorting={{ path, query, current: currentSort }}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action={path} className="flex min-w-0 flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="akun" />
              {currentSort && Object.entries(sortParams(currentSort)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
              <Input name="cari" defaultValue={search} aria-label="Cari nama atau email" placeholder="Cari nama atau email" className="w-full min-w-0 sm:w-48" />
              <Button type="submit" variant="outline" className="min-h-10"><Search aria-hidden="true" />Cari</Button>
            </form>
            <CreateAccountDialog />
          </div>
        }
        pagination={<PageLinks current={current} pages={pages} path={path} total={total} query={{ ...query, ...sortParams(currentSort) }} />}
        empty={<EmptyState title="Akun tidak ditemukan" description="Periksa kembali nama atau email yang dicari." />}>
        {rows.length ? rows.map((row, index) => (
          <DataTableRow key={row.id} number={(current - 1) * pageSize + index + 1}>
            <TableCell className="max-w-64 font-medium whitespace-normal wrap-anywhere">{row.name}{row.id === ownId && <span className="block text-xs text-muted-foreground">Akun Anda</span>}</TableCell>
            <TableCell className="max-w-64 whitespace-normal wrap-anywhere">{row.email}</TableCell>
            <TableCell><StatusBadge label={roleLabels[row.role]} /></TableCell>
            <TableCell><StatusBadge {...statusPresentation(accountPresentation, row.status)} /></TableCell>
            {hasActions && <TableCell className="w-px text-right">{row.id !== ownId && <AccountControls userId={row.id} name={row.name} role={row.role} status={row.status} />}</TableCell>}
          </DataTableRow>
        )) : undefined}
      </DataTable>
    </div>
  );
}

async function AuditContent({ page, sort }: { page: number; sort?: TableSort }) {
  const currentSort = auditColumns.some(({ key }) => key === sort?.column) ? sort : undefined;
  const { rows, current, pages, total, pageSize } = await listAccountAudit(await headers(), page, undefined, currentSort);
  const query = { tab: "audit" };
  return (
    <DataTable label="Riwayat audit akun"
      columns={auditColumns} sorting={{ path, query, current: currentSort }}
      pagination={<PageLinks current={current} pages={pages} path={path} total={total} query={{ ...query, ...sortParams(currentSort) }} />}
      empty={<EmptyState title="Belum ada riwayat akun" description="Aktivitas akun yang tercatat akan muncul di sini." />}>
      {rows.length ? rows.map((row, index) => (
        <DataTableRow key={row.id} number={(current - 1) * pageSize + index + 1}>
          <TableCell>{localDateTime.format(row.at)}</TableCell><TableCell className="min-w-28 max-w-56 whitespace-normal wrap-anywhere">{row.actorName}</TableCell>
          <TableCell><StatusBadge label={roleLabels[row.actorRole]} /></TableCell><TableCell className="min-w-32 max-w-64 whitespace-normal wrap-anywhere">{accountAuditLabels[row.action] ?? row.action}</TableCell>
        </DataTableRow>
      )) : undefined}
    </DataTable>
  );
}

import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { CorrectionTable } from "@/components/finance/correction-table";
import { AccountControls, CreateAccountDialog } from "@/components/account/account-controls";
import { ProfileForms } from "@/components/account/profile-forms";
import { DataTable, DataTableRow } from "@/components/shared/data-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { PageLinks } from "@/components/shared/page-links";
import { StatusBadge, statusPresentation } from "@/components/shared/status-badge";
import { accountPresentation } from "@/lib/status-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import { ledgerQuery } from "@/lib/domain/ledger-query";
import { businessTimeZone } from "@/lib/format";
import { roleLabels } from "@/lib/roles";
import { listAccountAudit, listAccounts } from "@/server/auth/accounts";
import { requireModule } from "@/server/auth/workspace";

export const metadata: Metadata = { title: "Pengaturan" };

const path = "/pengaturan";
const tabs = [
  { value: "profil", label: "Profil" }, { value: "akun", label: "Akun pengguna" }, { value: "audit", label: "Audit akun" }, { value: "koreksi", label: "Koreksi" },
];
const querySchema = z.object({
  tab: z.enum(["profil", "akun", "audit", "koreksi"]).catch("profil"),
  cari: z.string().trim().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});
const auditLabels: Readonly<Record<string, string>> = {
  bootstrap: "Membuat Administrator pertama",
  signin: "Masuk ke aplikasi",
  signout: "Keluar dari aplikasi",
  account_created: "Membuat akun",
  activation_issued: "Membuat tautan aktivasi",
  activation_completed: "Mengaktifkan akun",
  reset_issued: "Membuat tautan reset",
  reset_completed: "Mengatur ulang kata sandi",
  role_changed: "Mengubah peran",
  status_changed: "Mengubah status akun",
  profile_updated: "Memperbarui profil",
  password_changed: "Mengubah kata sandi",
};
const localDateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: businessTimeZone });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SettingsPage(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><SettingsContent {...props} /></Suspense>;
}

async function SettingsContent({ searchParams }: Props) {
  const actor = await requireModule("pengaturan");
  const raw = await searchParams;
  const params = querySchema.parse(raw);
  const administrator = actor.role === "administrator";
  const operator = actor.role === "abk";
  const tab = administrator || (operator && params.tab === "koreksi") ? params.tab : "profil";
  const visibleTabs = administrator ? tabs : tabs.filter(({ value }) => value === "profil" || (operator && value === "koreksi"));
  return (
    <>
      <ModuleHeader title="Pengaturan" description="Kelola profil, tampilan, dan hak akses sesuai peran Anda." icon={Settings} />
      <ModuleTabs tab={tab} tabs={visibleTabs} path={path}>
        {tab === "profil" && <ProfileForms name={actor.name} email={actor.email} role={actor.role} theme={actor.theme} />}
        {tab === "akun" && <AccountsContent search={params.cari} page={params.halaman} ownId={actor.id} />}
        {tab === "audit" && <AuditContent page={params.halaman} />}
        {tab === "koreksi" && <CorrectionTable path={path} tab={tab} query={ledgerQuery(raw)} administrator={administrator} />}
      </ModuleTabs>
    </>
  );
}

async function AccountsContent({ search, page, ownId }: { search: string; page: number; ownId: string }) {
  const { rows, total, pages, current } = await listAccounts(await headers(), search, page);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><MetricCard label={search ? "Hasil pencarian" : "Total akun"} value={total} /></div>
      <DataTable label="Akun pengguna"
        columns={["Nama", "Email", "Peran", "Status", "Tindakan"].map((label) => ({ label, key: label }))}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action={path} className="flex min-w-0 flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="akun" />
              <Input name="cari" defaultValue={search} aria-label="Cari nama atau email" placeholder="Cari nama atau email" className="w-full min-w-0 sm:w-48" />
              <Button type="submit" variant="outline">Cari</Button>
            </form>
            <CreateAccountDialog />
          </div>
        }
        pagination={<PageLinks current={current} pages={pages} path={path} query={{ tab: "akun", cari: search }} />}
        empty={<EmptyState title="Akun tidak ditemukan" description="Periksa kembali nama atau email yang dicari." />}>
        {rows.length ? rows.map((row, index) => (
          <DataTableRow key={row.id} number={(current - 1) * 12 + index + 1}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{roleLabels[row.role]}</TableCell>
            <TableCell><StatusBadge {...statusPresentation(accountPresentation, row.status)} /></TableCell>
            <TableCell>{row.id === ownId ? "Akun Anda" : <AccountControls userId={row.id} name={row.name} role={row.role} status={row.status} />}</TableCell>
          </DataTableRow>
        )) : undefined}
      </DataTable>
    </div>
  );
}

async function AuditContent({ page }: { page: number }) {
  const { rows, current, pages } = await listAccountAudit(await headers(), page);
  return (
    <DataTable label="Riwayat audit akun"
      columns={["Waktu (WIB)", "Pengguna", "Peran", "Tindakan"].map((label) => ({ label, key: label }))}
      pagination={<PageLinks current={current} pages={pages} path={path} query={{ tab: "audit" }} />}
      empty={<EmptyState title="Belum ada riwayat akun" description="Aktivitas akun yang tercatat akan muncul di sini." />}>
      {rows.length ? rows.map((row, index) => (
        <DataTableRow key={row.id} number={(current - 1) * 15 + index + 1}>
          <TableCell>{localDateTime.format(row.at)}</TableCell><TableCell>{row.actorName}</TableCell>
          <TableCell>{roleLabels[row.actorRole]}</TableCell><TableCell>{auditLabels[row.action] ?? row.action}</TableCell>
        </DataTableRow>
      )) : undefined}
    </DataTable>
  );
}

import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { z } from "zod";
import { AccountControls, CreateAccountDialog } from "@/components/account/account-controls";
import { ProfileForms } from "@/components/account/profile-forms";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { ModuleTabs } from "@/components/shared/module-tabs";
import { PageLinks } from "@/components/shared/page-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { businessTimeZone } from "@/lib/format";
import { roleLabels } from "@/lib/roles";
import { listAccountAudit, listAccounts } from "@/server/auth/accounts";
import { requireModule } from "@/server/auth/workspace";

export const metadata: Metadata = { title: "Pengaturan" };

const path = "/pengaturan";
const tabs = [
  { value: "profil", label: "Profil" }, { value: "akun", label: "Akun pengguna" }, { value: "audit", label: "Audit akun" },
];
const querySchema = z.object({
  tab: z.enum(["profil", "akun", "audit"]).catch("profil"),
  cari: z.string().trim().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});
const statusLabels = { pending: "Menunggu aktivasi", active: "Aktif", suspended: "Ditangguhkan" };
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
  const params = querySchema.parse(await searchParams);
  const administrator = actor.role === "administrator";
  const tab = administrator ? params.tab : "profil";
  return (
    <>
      <ModuleHeader title="Pengaturan" description="Kelola profil, tampilan, dan hak akses sesuai peran Anda." icon={Settings} />
      <ModuleTabs tab={tab} tabs={administrator ? tabs : tabs.slice(0, 1)} path={path}>
        {tab === "profil" && <ProfileForms name={actor.name} email={actor.email} role={actor.role} theme={actor.theme} />}
        {tab === "akun" && <AccountsContent search={params.cari} page={params.halaman} ownId={actor.id} />}
        {tab === "audit" && <AuditContent page={params.halaman} />}
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
        {rows.length ? rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{roleLabels[row.role]}</TableCell>
            <TableCell><Badge variant={row.status === "active" ? "secondary" : "outline"}>{statusLabels[row.status]}</Badge></TableCell>
            <TableCell>{row.id === ownId ? "Akun Anda" : <AccountControls userId={row.id} name={row.name} role={row.role} status={row.status} />}</TableCell>
          </TableRow>
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
      {rows.length ? rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell>{localDateTime.format(row.at)}</TableCell><TableCell>{row.actorName}</TableCell>
          <TableCell>{roleLabels[row.actorRole]}</TableCell><TableCell>{auditLabels[row.action] ?? row.action}</TableCell>
        </TableRow>
      )) : undefined}
    </DataTable>
  );
}

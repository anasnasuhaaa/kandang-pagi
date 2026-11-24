"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RowActions, useRowAction, type RowAction } from "@/components/shared/row-actions";
import { FormDialog } from "@/components/shared/form-dialog";
import { changeRoleSchema, changeStatusSchema, issueLinkSchema, newAccountSchema } from "@/lib/account-validation";
import { roleLabels, roles, type Role } from "@/lib/roles";
import { createUserAction, issueLinkAction, setRoleAction, setStatusAction } from "@/server/auth/actions";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { useValidatedForm } from "@/components/shared/use-validated-form";

const roleChoices = roles.map((value) => ({ value, label: roleLabels[value] }));
const issuedLinkSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
type IssuedLink = z.infer<typeof issuedLinkSchema>;

function IssuedLinkView({ link }: { link: IssuedLink }) {
  const expiresAt = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta",
  }).format(new Date(link.expiresAt));

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Tautan disalin.");
    } catch {
      toast.error("Tautan gagal disalin. Pilih dan salin dari kolom tautan.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm/6">Bagikan tautan ini secara pribadi setelah memverifikasi penerima. Tautan ditampilkan sekali dan berlaku hingga {expiresAt} WIB.</p>
      <TextField name="link" label="Tautan akses akun" value={link.url} readOnly onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" onClick={copy}>Salin tautan</Button>
    </div>
  );
}

export function CreateAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLink>();
  const form = useValidatedForm(newAccountSchema, createUserAction, (value) => {
    setIssued(issuedLinkSchema.parse(value));
    toast.success("Akun dibuat. Bagikan tautan aktivasi.");
    router.refresh();
  });

  return (
    <FormDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setIssued(undefined); }}
      title="Tambah akun" description="Pilih peran dan buat tautan aktivasi untuk pengguna baru.">
      {issued ? <IssuedLinkView link={issued} /> : (
        <form noValidate onSubmit={form.submit} className="space-y-4">
          <TextField name="name" label="Nama pengguna" error={form.errors.name} />
          <TextField name="email" type="email" label="Email pengguna" error={form.errors.email} />
          <ChoiceField name="role" label="Peran" choices={roleChoices} error={form.errors.role} />
          <FormError message={form.message} />
          <Button type="submit" className="h-10" disabled={form.pending}>Buat akun</Button>
        </form>
      )}
    </FormDialog>
  );
}

type Account = { userId: string; name: string; role: Role; status: "active" | "suspended" | "pending" };

export function AccountControls(account: Account) {
  const { status } = account;
  const actions: RowAction[] = [
    { id: "role", label: "Ubah peran", icon: "edit", content: <ChangeRole {...account} /> },
  ];
  if (status !== "suspended") {
    actions.push({ id: "link", label: status === "pending" ? "Tautan aktivasi" : "Tautan reset",
      icon: "access", content: <IssueLink {...account} /> });
  }
  if (status !== "pending") {
    actions.push({ id: "status", label: status === "active" ? "Tangguhkan akun" : "Aktifkan kembali",
      icon: status === "active" ? "cancel" : "check", destructive: status === "active", content: <ChangeStatus {...account} /> });
  }
  return <RowActions actions={actions} />;
}

function ChangeRole({ userId, name, role }: Account) {
  const router = useRouter();
  const launch = useRowAction();
  const form = useValidatedForm(changeRoleSchema, setRoleAction, () => {
    launch?.close();
    toast.success("Peran diubah.");
    router.refresh();
  });

  return <FormDialog open={launch?.open ?? false} onOpenChange={(open) => { if (!open && !form.pending) launch?.close(); }}
    title="Ubah peran" description={`Pilih peran baru untuk ${name}. Perubahan mengakhiri sesi akun ini.`}>
    <form noValidate onSubmit={form.submit} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <ChoiceField name="role" label="Peran baru" choices={roleChoices} value={role} error={form.errors.role} />
      <FormError message={form.message} />
      <Button type="submit" disabled={form.pending}>{form.pending ? "Menyimpan…" : "Simpan peran"}</Button>
    </form>
  </FormDialog>;
}

function IssueLink({ userId, name, status }: Account) {
  const launch = useRowAction();
  const [issued, setIssued] = useState<IssuedLink>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const purpose = status === "pending" ? "activation" : "reset";

  async function generateLink() {
    const input = issueLinkSchema.parse({ userId, purpose });
    setPending(true);
    setMessage("");
    try {
      const result = await issueLinkAction(input);
      if (!result.ok) return setMessage(result.message);
      setIssued(issuedLinkSchema.parse(result.value));
      toast.success("Tautan akses dibuat.");
    } catch {
      setMessage("Tautan gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  return <FormDialog open={launch?.open ?? false} onOpenChange={(open) => {
    if (open || pending) return;
    setIssued(undefined);
    launch?.close();
  }} title={status === "pending" ? "Tautan aktivasi" : "Tautan reset"}
    description={`Pastikan identitas ${name} sebelum membuat dan membagikan tautan baru.`}>
    {issued ? <IssuedLinkView link={issued} /> : (
      <div className="space-y-4"><FormError message={message} />
        <Button type="button" onClick={generateLink} disabled={pending}>{pending ? "Menyiapkan…" : "Buat tautan baru"}</Button>
      </div>
    )}
  </FormDialog>;
}

function ChangeStatus({ userId, status, name }: Account) {
  const router = useRouter();
  const launch = useRowAction();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const suspend = status === "active";
  const label = suspend ? "Tangguhkan akun" : "Aktifkan kembali";

  async function changeStatus() {
    const change = changeStatusSchema.parse({ userId, status: suspend ? "suspended" : "active" });
    setPending(true);
    setMessage("");
    try {
      const result = await setStatusAction(change);
      if (!result.ok) return setMessage(result.message);
      launch?.close();
      toast.success("Status akun diperbarui.");
      router.refresh();
    } catch {
      setMessage("Status akun gagal diperbarui.");
    } finally {
      setPending(false);
    }
  }

  return <AlertDialog open={launch?.open ?? false} onOpenChange={(open) => { if (!open && !pending) launch?.close(); }}>
    <AlertDialogContent finalFocus={launch?.trigger} className="max-h-[90dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{label}</AlertDialogTitle>
        <AlertDialogDescription>{suspend ? `Akses ${name} dihentikan dan seluruh sesi ditutup.` : `${name} dapat kembali masuk dengan kata sandi yang masih berlaku.`}</AlertDialogDescription>
      </AlertDialogHeader>
      <FormError message={message} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
        <Button type="button" variant={suspend ? "destructive" : "default"} onClick={changeStatus} disabled={pending}>
          {pending ? "Menyimpan…" : label}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

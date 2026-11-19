"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/shared/form-dialog";
import { changeRoleSchema, changeStatusSchema, issueLinkSchema, newAccountSchema } from "@/lib/account-validation";
import { roleLabels, roles, type Role } from "@/lib/roles";
import { createUserAction, issueLinkAction, setRoleAction, setStatusAction } from "@/server/auth/actions";
import { ChoiceField, FormError, TextField } from "./form-fields";
import { useAccountForm } from "./use-account-form";

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
  const form = useAccountForm(newAccountSchema, createUserAction, (value) => {
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

export function AccountControls({ userId, name, role, status }: {
  userId: string; name: string; role: Role; status: "active" | "suspended" | "pending";
}) {
  const router = useRouter();
  const [roleOpen, setRoleOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLink>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const purpose = status === "pending" ? "activation" : "reset";
  const stateLabel = status === "active" ? "Tangguhkan akun" : "Aktifkan kembali";
  const form = useAccountForm(changeRoleSchema, setRoleAction, () => {
    setRoleOpen(false);
    toast.success("Peran diubah.");
    router.refresh();
  });

  async function changeStatus() {
    const change = changeStatusSchema.parse({ userId, status: status === "active" ? "suspended" : "active" });
    setPending(true);
    setMessage("");
    try {
      const result = await setStatusAction(change);
      if (!result.ok) return setMessage(result.message);
      setConfirmOpen(false);
      toast.success("Status akun diperbarui.");
      router.refresh();
    } catch {
      setMessage("Status akun gagal diperbarui.");
    } finally {
      setPending(false);
    }
  }

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

  return (
    <div className="flex items-center gap-2">
      <FormDialog open={roleOpen} onOpenChange={setRoleOpen} title="Ubah peran" description={`Pilih peran baru untuk ${name}. Perubahan mengakhiri sesi akun ini.`}>
        <form noValidate onSubmit={form.submit} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <ChoiceField name="role" label="Peran baru" choices={roleChoices} value={role} error={form.errors.role} />
          <FormError message={form.message} />
          <Button type="submit" disabled={form.pending}>Simpan peran</Button>
        </form>
      </FormDialog>
      {status !== "suspended" && (
        <FormDialog open={linkOpen} onOpenChange={(next) => { setLinkOpen(next); if (!next) { setIssued(undefined); setMessage(""); } }}
          title={status === "pending" ? "Tautan aktivasi" : "Tautan reset"}
          description={`Pastikan identitas ${name} sebelum membuat dan membagikan tautan baru.`}>
          {issued ? <IssuedLinkView link={issued} /> : (
            <div className="space-y-4"><FormError message={message} /><Button type="button" onClick={generateLink} disabled={pending}>Buat tautan baru</Button></div>
          )}
        </FormDialog>
      )}
      {status !== "pending" && (
        <AlertDialog open={confirmOpen} onOpenChange={(next) => { setConfirmOpen(next); if (!next) setMessage(""); }}>
          <AlertDialogTrigger render={<Button variant="outline" />}>{stateLabel}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{stateLabel}</AlertDialogTitle>
              <AlertDialogDescription>{status === "active" ? `Akses ${name} dihentikan dan seluruh sesi ditutup.` : `${name} dapat kembali masuk dengan kata sandi yang masih berlaku.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <FormError message={message} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
              <Button type="button" variant={status === "active" ? "destructive" : "default"} onClick={changeStatus} disabled={pending}>{stateLabel}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

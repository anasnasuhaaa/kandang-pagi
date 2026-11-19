"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { completeLinkSchema } from "@/lib/account-validation";
import { completeLinkAction } from "@/server/auth/actions";
import { FormError, TextField, type FieldErrors } from "@/components/shared/form-fields";

export function LinkForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const parsed = completeLinkSchema.safeParse({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      purpose: fragment.get("tujuan"),
      token: fragment.get("token"),
    });
    if (!parsed.success) {
      const issues = z.flattenError(parsed.error).fieldErrors;
      setErrors({ password: issues.password, confirmation: issues.confirmation });
      setMessage(issues.purpose || issues.token ? "Tautan tidak valid. Hubungi Administrator untuk tautan baru." : "");
      return;
    }
    setErrors({});
    setMessage("");
    setPending(true);
    try {
      const result = await completeLinkAction(parsed.data);
      if (result.ok) {
        window.history.replaceState(null, "", "/akses");
        toast.success("Kata sandi berhasil disimpan.");
        router.replace("/masuk");
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("Tidak dapat terhubung. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField name="password" label="Kata sandi baru" type="password" autoComplete="new-password" error={errors.password} />
      <TextField name="confirmation" label="Ulangi kata sandi" type="password" autoComplete="new-password" error={errors.confirmation} />
      <FormError message={message} />
      <Button className="h-10 w-full" type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan kata sandi"}</Button>
      <Link href="/masuk" className="inline-block rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2">Kembali ke halaman masuk</Link>
    </form>
  );
}

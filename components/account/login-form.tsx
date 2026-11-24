"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { loginSchema, themeSchema } from "@/lib/account-validation";
import { FormError, PasswordField, TextField, type FieldErrors } from "@/components/shared/form-fields";

export function LoginForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const { setTheme } = useTheme();
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!values.success) return setErrors(z.flattenError(values.error).fieldErrors);
    setErrors({});
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values.data),
      });
      if (!response.ok) {
        setMessage(response.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar."
          : response.status >= 500 ? "Layanan akun sementara tidak tersedia." : "Email atau kata sandi salah, atau akun belum aktif.");
        return;
      }
      const data = await response.json();
      const theme = themeSchema.safeParse(data.user?.theme);
      if (theme.success) setTheme(theme.data);
      toast.success("Berhasil masuk.");
      router.replace(data.user?.role === "reseller" ? "/reseller" : "/dashboard");
      router.refresh();
    } catch {
      setMessage("Tidak dapat terhubung. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField name="email" label="Email" type="email" autoComplete="username" error={errors.email} />
      <PasswordField name="password" label="Kata sandi" autoComplete="current-password" error={errors.password} />
      <FormError message={message} />
      <Button className="min-h-11 w-full" type="submit" disabled={pending}>{pending ? "Memeriksa…" : "Masuk"}</Button>
      <p className="text-sm/6 text-muted-foreground">Hubungi Administrator untuk mengatur ulang kata sandi.</p>
    </form>
  );
}

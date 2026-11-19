"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordSchema, profileSchema } from "@/lib/account-validation";
import { roleLabels, type Role, type Theme } from "@/lib/roles";
import { changePasswordAction, saveProfileAction } from "@/server/auth/actions";
import { ChoiceField, FormError, TextField } from "./form-fields";
import { useAccountForm } from "./use-account-form";

const themeChoices = [
  { value: "system", label: "Ikuti perangkat" },
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
];

export function ProfileForms({ name, email, role, theme }: { name: string; email: string; role: Role; theme: Theme }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const profile = useAccountForm(profileSchema, async (values) => {
    const result = await saveProfileAction(values);
    if (result.ok) setTheme(values.theme);
    return result;
  }, () => {
    toast.success("Profil disimpan.");
    router.refresh();
  });
  const password = useAccountForm(changePasswordSchema, changePasswordAction, () => {
    toast.success("Kata sandi diubah. Silakan masuk kembali.");
    router.replace("/masuk");
  });

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle><h2>Profil dan tampilan</h2></CardTitle><CardDescription>{roleLabels[role]}</CardDescription></CardHeader>
        <CardContent>
          <form noValidate className="space-y-4" onSubmit={profile.submit}>
            <TextField name="name" label="Nama" defaultValue={name} autoComplete="name" error={profile.errors.name} />
            <TextField name="email" label="Email akun" type="email" defaultValue={email} readOnly />
            <ChoiceField key={theme} name="theme" label="Tema" value={theme} choices={themeChoices} error={profile.errors.theme} />
            <FormError message={profile.message} />
            <Button type="submit" className="h-10" disabled={profile.pending}>Simpan profil</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><h2>Ubah kata sandi</h2></CardTitle><CardDescription>Siapkan kata sandi saat ini. Setelah menyimpan, masuk kembali.</CardDescription></CardHeader>
        <CardContent>
          <form noValidate className="space-y-4" onSubmit={password.submit}>
            <TextField name="current" label="Kata sandi saat ini" type="password" autoComplete="current-password" error={password.errors.current} />
            <TextField name="password" label="Kata sandi baru" type="password" autoComplete="new-password" error={password.errors.password} />
            <TextField name="confirmation" label="Ulangi kata sandi baru" type="password" autoComplete="new-password" error={password.errors.confirmation} />
            <FormError message={password.message} />
            <Button type="submit" className="h-10" disabled={password.pending}>Ubah kata sandi</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

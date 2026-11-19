import { z } from "zod";
import { roles, themes } from "./roles";
import { emailSchema, nameSchema, passwordSchema } from "./validation";

export const accountIdSchema = z.string().regex(/^[a-zA-Z0-9]{16,64}$/, "Akun tidak valid.");
export const roleSchema = z.enum(roles, { error: "Pilih peran yang valid." });
export const themeSchema = z.enum(themes, { error: "Pilih tema yang valid." });
export const purposeSchema = z.enum(["activation", "reset"], { error: "Tautan tidak valid." });
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Masukkan kata sandi.").max(128, "Kata sandi terlalu panjang."),
});
export const newAccountSchema = z.object({ name: nameSchema, email: emailSchema, role: roleSchema });
export const bootstrapSchema = newAccountSchema.omit({ role: true }).extend({ password: passwordSchema });
export const profileSchema = z.object({ name: nameSchema, theme: themeSchema });
export const passwordConfirmation = z.object({ password: passwordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Ulangi kata sandi yang sama." });
export const changePasswordSchema = z.intersection(passwordConfirmation, z.object({ current: loginSchema.shape.password }))
  .refine((value) => value.current !== value.password, { path: ["password"], message: "Gunakan kata sandi baru yang berbeda." });
export const completeLinkSchema = z.intersection(passwordConfirmation, z.object({
  purpose: purposeSchema,
  token: z.string().regex(/^[a-zA-Z0-9]{24}$/, "Tautan tidak valid."),
}));
export const issueLinkSchema = z.object({ userId: accountIdSchema, purpose: purposeSchema });
export const changeRoleSchema = z.object({ userId: accountIdSchema, role: roleSchema });
export const changeStatusSchema = z.object({
  userId: accountIdSchema,
  status: z.enum(["active", "suspended"], { error: "Status akun tidak valid." }),
});

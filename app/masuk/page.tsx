import type { Metadata } from "next";
import { AuthFrame } from "@/components/account/auth-frame";
import { LoginForm } from "@/components/account/login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return <AuthFrame title="Masuk" description="Gunakan akun yang diberikan oleh Administrator."><LoginForm /></AuthFrame>;
}

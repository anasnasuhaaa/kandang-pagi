import type { Metadata } from "next";
import { AuthFrame } from "@/components/account/auth-frame";
import { LinkForm } from "@/components/account/link-form";
import { passwordPolicy } from "@/lib/validation";

export const metadata: Metadata = { title: "Atur kata sandi", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function AccessPage() {
  return <AuthFrame title="Atur kata sandi" description={`Gunakan tautan dari Administrator dan buat kata sandi dengan minimal ${passwordPolicy.minPasswordLength} karakter.`}><LinkForm /></AuthFrame>;
}

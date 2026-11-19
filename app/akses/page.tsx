import type { Metadata } from "next";
import { AuthFrame } from "@/components/account/auth-frame";
import { LinkForm } from "@/components/account/link-form";

export const metadata: Metadata = { title: "Atur kata sandi", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function AccessPage() {
  return <AuthFrame title="Atur kata sandi" description="Gunakan tautan dari Administrator dan buat kata sandi dengan minimal 12 karakter."><LinkForm /></AuthFrame>;
}

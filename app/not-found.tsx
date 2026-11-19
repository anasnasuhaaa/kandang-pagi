import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground">Periksa alamat halaman atau kembali ke Dashboard.</p>
      <Link className={buttonVariants()} href="/dashboard">Kembali ke Dashboard</Link>
    </main>
  );
}

import type { Metadata } from "next";
import { Layers3 } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState, ModuleHeader } from "@/components/shared/module";
import { modules, type Module } from "@/lib/navigation";

type Props = { params: Promise<{ module: string }> };

const pending: Record<Module["slug"], string> = {
  dashboard: "Ringkasan operasional akan muncul setelah pencatatan populasi, pakan, dan panen tersedia.",
  populasi: "Pencatatan kandang, kelompok ternak, dan mutasi belum tersedia.",
  pakan: "Pencatatan penerimaan, distribusi, dan sisa pakan belum tersedia.",
  "produksi-telur": "Pencatatan panen, sortir, dan penjualan telur belum tersedia.",
  kesehatan: "Pencatatan kesehatan, jadwal vaksin, dan karantina belum tersedia.",
  keuangan: "Pencatatan transaksi dan ringkasan kas belum tersedia.",
  reseller: "Pencatatan stok dan penjualan reseller belum tersedia.",
  laporan: "Pemilihan periode dan unduhan laporan belum tersedia.",
  pengaturan: "Pengaturan akun belum tersedia. Preferensi tampilan dapat diubah dari bilah atas.",
};

export function generateStaticParams() {
  return modules.map(({ slug }) => ({ module: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const item = modules.find(({ slug }) => slug === module);
  return item ? { title: item.title, description: item.description } : {};
}

export default async function ModulePage({ params }: Props) {
  const { module } = await params;
  const item = modules.find(({ slug }) => slug === module);
  if (!item) notFound();
  return (
    <>
      <ModuleHeader title={item.title} description={item.description} icon={item.icon} />
      <EmptyState icon={Layers3} title="Modul sedang disiapkan" description={pending[item.slug]} />
    </>
  );
}

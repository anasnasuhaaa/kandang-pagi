import {
  Activity, Boxes, ChartNoAxesCombined, Egg, House, LayoutDashboard,
  Settings, Store, Wallet, type LucideIcon,
} from "lucide-react";

import { z } from "zod";
import { roles, type Role } from "./roles";
export type { Role } from "./roles";
const farm = ["administrator", "pemilik", "abk"] as const;

export const modules = [
  { slug: "dashboard", title: "Dashboard", icon: LayoutDashboard, roles: farm, description: "Pantau populasi, produksi, dan pencatatan operasional peternakan." },
  { slug: "populasi", title: "Populasi Ternak", icon: House, roles: farm, description: "Kelola kandang, kelompok ternak, dan riwayat mutasi populasi." },
  { slug: "pakan", title: "Pakan", icon: Boxes, roles: farm, description: "Catat persediaan gudang, distribusi ke kandang, dan sisa pakan harian." },
  { slug: "produksi-telur", title: "Produksi Telur", icon: Egg, roles: farm, description: "Catat panen, sortir hasil produksi, dan penjualan telur." },
  { slug: "kesehatan", title: "Kesehatan & Vaksin", icon: Activity, roles: farm, description: "Pantau kejadian kesehatan, jadwal vaksin, dan karantina ternak." },
  { slug: "keuangan", title: "Keuangan", icon: Wallet, roles: ["administrator", "pemilik"], description: "Telusuri pemasukan, pengeluaran, dan saldo kas peternakan." },
  { slug: "reseller", title: "Reseller", icon: Store, roles: ["reseller"], description: "Kelola persediaan, satuan, penjualan, dan kas usaha reseller." },
  { slug: "laporan", title: "Laporan", icon: ChartNoAxesCombined, roles, description: "Tinjau data historis sesuai periode dan cakupan yang diizinkan." },
  { slug: "pengaturan", title: "Pengaturan", icon: Settings, roles, description: "Kelola profil, preferensi tampilan, dan akses pengguna." },
] as const satisfies ReadonlyArray<{
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  roles: readonly Role[];
}>;

export type Module = (typeof modules)[number];
export type ModuleSlug = Module["slug"];

export function canViewModule(role: Role, module: Module) {
  return (module.roles as readonly Role[]).includes(role);
}

export const feedSections = [
  { value: "stok", label: "Stok Pakan", href: "/pakan" },
  { value: "aktivitas", label: "Aktivitas Pakan", href: "/pakan?tab=aktivitas" },
  { value: "jenis", label: "Jenis Pakan", href: "/pakan?tab=jenis" },
] as const;

export const feedTabSchema = z.enum([
  "stok", "aktivitas", "jenis", "sisa", "penyesuaian", "masuk", "keluar", "campuran",
]).catch("stok");

export function feedSection(tab: z.infer<typeof feedTabSchema>) {
  if (tab === "jenis") return "jenis";
  if (tab === "aktivitas" || tab === "masuk" || tab === "keluar" || tab === "campuran") return "aktivitas";
  return "stok";
}

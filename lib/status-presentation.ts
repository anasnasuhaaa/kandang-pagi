import type { user } from "@/db/schema/auth";
import type { correctionStatus } from "@/db/schema/control";
import type { cashDirection, eggCategory, healthStatus, populationKind } from "@/db/schema/farm";
import type { vaccinationStatus } from "@/lib/domain/health-input";
import { movementLabels } from "@/lib/domain/population-input";

export type SemanticTone = "success" | "warning" | "danger" | "info" | "neutral" | "adjustment" | "earth";
export type StatusPresentation = { label: string; tone: SemanticTone };

export function statusPresentation(mapping: Readonly<Record<string, StatusPresentation>>, value: string): StatusPresentation {
  return Object.hasOwn(mapping, value) ? mapping[value] : { tone: "neutral", label: "Status tidak diketahui" };
}

export const accountPresentation = {
  pending: { label: "Menunggu aktivasi", tone: "warning" },
  active: { label: "Aktif", tone: "success" },
  suspended: { label: "Ditangguhkan", tone: "danger" },
} satisfies Record<typeof user.$inferSelect.status, StatusPresentation>;

export const correctionPresentation = {
  pending: { label: "Menunggu", tone: "warning" },
  approved: { label: "Disetujui", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
} satisfies Record<(typeof correctionStatus.enumValues)[number], StatusPresentation>;

export const incidentPresentation = {
  open: { label: "Terbuka", tone: "warning" },
  monitoring: { label: "Dipantau", tone: "warning" },
  resolved: { label: "Selesai", tone: "success" },
} satisfies Record<(typeof healthStatus.enumValues)[number], StatusPresentation>;

export const vaccinePresentation = {
  overdue: { label: "Terlambat", tone: "danger" },
  today: { label: "Hari ini", tone: "warning" },
  upcoming: { label: "Mendatang", tone: "info" },
  done: { label: "Sudah dilaksanakan", tone: "success" },
} satisfies Record<ReturnType<typeof vaccinationStatus>, StatusPresentation>;

export const eggPresentation = {
  ungraded: { label: "Belum Disortir", tone: "warning" },
  coklat: { label: "Coklat", tone: "earth" },
  putih: { label: "Putih", tone: "neutral" },
  cacat: { label: "Cacat", tone: "danger" },
} satisfies Record<(typeof eggCategory.enumValues)[number], StatusPresentation>;

export const movementPresentation = {
  opening: { label: movementLabels.opening, tone: "neutral" },
  arrival: { label: movementLabels.arrival, tone: "success" },
  death: { label: movementLabels.death, tone: "danger" },
  cull: { label: movementLabels.cull, tone: "warning" },
  exit: { label: movementLabels.exit, tone: "danger" },
  transfer: { label: movementLabels.transfer, tone: "info" },
} satisfies Record<(typeof populationKind.enumValues)[number], StatusPresentation>;

export const cashPresentation = {
  opening: { label: "Saldo awal", tone: "neutral" },
  income: { label: "Pemasukan", tone: "success" },
  expense: { label: "Pengeluaran", tone: "danger" },
  reversal: { label: "Pembalik", tone: "adjustment" },
} satisfies Record<(typeof cashDirection.enumValues)[number], StatusPresentation>;

export function recordStatus(effective: boolean): StatusPresentation {
  return effective ? { label: "Tercatat", tone: "success" } : { label: "Dibatalkan", tone: "danger" };
}

export function activeStatus(active: boolean): StatusPresentation {
  return active ? { label: "Aktif", tone: "success" } : { label: "Nonaktif", tone: "neutral" };
}

export function flockPlacementStatus(alive: number | undefined) {
  return alive === undefined ? "Belum ditempatkan" : alive > 0 ? "Aktif" : "Selesai";
}

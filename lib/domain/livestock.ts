export type MovementKind = "opening" | "arrival" | "death" | "cull" | "exit" | "transfer";

export type Movement = {
  kind: MovementKind;
  count: number;
  flockId: string;
  fromBarnId: string | null;
  toBarnId: string | null;
};

export type Placement = { barnId: string; alive: number };

export class PopulationConflict extends Error {}

export function applyMovement(current: Placement | undefined, movement: Movement): Placement {
  if (movement.kind === "opening" || movement.kind === "arrival") {
    if (current || !movement.toBarnId) throw new PopulationConflict("Kelompok sudah memiliki penempatan awal.");
    return { barnId: movement.toBarnId, alive: movement.count };
  }
  if (!current || !current.alive || current.barnId !== movement.fromBarnId) {
    throw new PopulationConflict("Mutasi tidak sesuai dengan penempatan ternak pada tanggal tersebut.");
  }
  if (movement.kind === "transfer") {
    if (!movement.toBarnId || movement.toBarnId === current.barnId || movement.count !== current.alive) {
      throw new PopulationConflict("Transfer harus memindahkan semua ternak hidup ke kandang lain.");
    }
    return { barnId: movement.toBarnId, alive: current.alive };
  }
  const alive = current.alive - movement.count;
  if (alive < 0) throw new PopulationConflict("Mutasi membuat populasi pada riwayat berikutnya menjadi negatif.");
  return { barnId: current.barnId, alive };
}

export type ProductionDay = {
  eggs: number;
  hens: number;
  housed: number;
  recorded: boolean;
  mixed: boolean;
};

export function productionRates(days: readonly ProductionDay[], scope: "flock" | "barn" | "farm") {
  let hdpEggs = 0;
  let hdpHens = 0;
  let hhpEggs = 0;
  let hhpHens = 0;
  let measuredDays = 0;
  let activeDays = 0;
  for (const day of days) {
    if (day.hens > 0 || day.housed > 0) activeDays++;
    if (!day.recorded || (scope === "flock" && day.mixed)) continue;
    if (day.hens > 0) {
      hdpEggs += day.eggs;
      hdpHens += day.hens;
      measuredDays++;
    }
    if (scope === "flock" && day.housed > 0) {
      hhpEggs += day.eggs;
      hhpHens += day.housed;
    }
  }
  return {
    hdp: hdpHens ? hdpEggs * 100 / hdpHens : null,
    hhp: hhpHens ? hhpEggs * 100 / hhpHens : null,
    measuredDays,
    activeDays,
  };
}

import type { Category } from "./production-input";

export class InventoryConflict extends Error {}

export type FeedDelta = {
  productId: string;
  barnId: string | null;
  grams: number;
  value: bigint | null;
  kind: "opening" | "purchase" | "mix_in" | "mix_out" | "issue" | "return" | "waste" | "adjustment" | "reversal";
};

export type FeedRecord = {
  id: string;
  day: string;
  sequence?: bigint;
  moves: FeedDelta[];
  close?: { barnId: string; productId: string; grams: number };
};

type FeedBalance = { barnId: string | null; productId: string; grams: number; value: bigint; closedOn?: string; closeSequence?: bigint };
export type DailyFeed = { day: string; barnId: string; productId: string; available: number; closing: number | null; consumed: number | null; stale: boolean };

const zero = BigInt(0);

export function stockKey(barn: string | null, product: string) {
  return `${barn ?? "warehouse"}:${product}`;
}

function subtract(balance: FeedBalance, grams: number) {
  if (grams > balance.grams) throw new InventoryConflict("Stok pakan tidak cukup pada salah satu tanggal dalam riwayat.");
  const cost = grams === 0 ? zero : balance.value * BigInt(grams) / BigInt(balance.grams);
  balance.grams -= grams;
  balance.value -= cost;
  return cost;
}

export function reconcileFeed(records: readonly FeedRecord[], previousDate: (date: string) => string) {
  const balances = new Map<string, FeedBalance>();
  const valuation = new Map<string, bigint>();
  const daily: DailyFeed[] = [];
  let position = 0;
  while (position < records.length) {
    const day = records[position].day;
    const yesterday = previousDate(day);
    const start = new Map<string, boolean>();
    const closes = new Map<string, NonNullable<FeedRecord["close"]> & { sequence: bigint }>();
    const latestWrite = new Map<string, bigint>();
    const source = (key: string, sequence: bigint) => {
      if (sequence > (latestWrite.get(key) ?? zero)) latestWrite.set(key, sequence);
    };
    const touched = new Set<string>();
    for (const [key, balance] of balances) {
      if (balance.barnId) {
        start.set(key, balance.grams === 0 || balance.closedOn === yesterday);
        source(key, balance.closeSequence ?? zero);
        if (balance.grams > 0) touched.add(key);
      }
    }
    while (position < records.length && records[position].day === day) {
      const { id, moves, close, sequence = BigInt(position + 1) } = records[position++];
      let deducted = zero;
      let returned = zero;
      for (const move of moves.filter(({ grams }) => grams < 0)) {
        const key = stockKey(move.barnId, move.productId);
        const current = balances.get(key);
        if (!current) throw new InventoryConflict("Stok pakan tidak cukup pada salah satu tanggal dalam riwayat.");
        if (move.barnId) { touched.add(key); source(key, sequence); }
        const cost = subtract(current, -move.grams);
        deducted += cost;
        if (move.kind === "return") returned += cost;
      }
      for (const move of moves.filter(({ grams }) => grams > 0)) {
        const key = stockKey(move.barnId, move.productId);
        const current = balances.get(key);
        if (move.kind === "opening" && current) throw new InventoryConflict("Saldo awal harus mendahului pergerakan stok pertama.");
        const balance = current ?? { barnId: move.barnId, productId: move.productId, grams: 0, value: zero };
        const internal = ["issue", "mix_out", "return"].includes(move.kind);
        balance.value += internal ? (move.kind === "return" ? returned : deducted) : move.value ?? zero;
        balance.grams += move.grams;
        balances.set(key, balance);
        if (move.barnId) { touched.add(key); source(key, sequence); }
      }
      valuation.set(id, deducted);
      if (close) {
        const key = stockKey(close.barnId, close.productId);
        if (closes.has(key)) throw new InventoryConflict("Sisa harian untuk kandang dan pakan ini sudah tercatat.");
        closes.set(key, { ...close, sequence });
        touched.add(key);
        if (!balances.has(key)) balances.set(key, { barnId: close.barnId, productId: close.productId, grams: 0, value: zero });
      }
    }
    for (const key of touched) {
      const balance = balances.get(key)!;
      const close = closes.get(key);
      const available = balance.grams;
      let consumed: number | null = null;
      const stale = Boolean(close && (latestWrite.get(key) ?? zero) > close.sequence);
      if (close) {
        if (close.grams > available) throw new InventoryConflict("Sisa terukur melebihi stok yang tercatat pada tanggal tersebut.");
        if (!stale && (start.get(key) ?? true)) consumed = available - close.grams;
        subtract(balance, available - close.grams);
        balance.closedOn = day;
        balance.closeSequence = close.sequence;
      }
      daily.push({ day, barnId: balance.barnId!, productId: balance.productId, available, closing: close?.grams ?? null, consumed, stale });
    }
  }
  return { balances, valuation, daily };
}

export type EggDelta = { harvestId: string | null; category: Category; pieces: number };

export function reconcileEggs(rows: readonly EggDelta[]) {
  const balances: Record<Category, number> = { ungraded: 0, coklat: 0, putih: 0, cacat: 0 };
  const lots = new Map<string, number>();
  for (const row of rows) {
    balances[row.category] += row.pieces;
    if (row.category === "ungraded") {
      if (!row.harvestId) throw new InventoryConflict("Pilih lot panen telur belum disortir.");
      const pieces = (lots.get(row.harvestId) ?? 0) + row.pieces;
      if (pieces < 0) throw new InventoryConflict("Jumlah melebihi stok lot telur belum disortir pada tanggal tersebut.");
      lots.set(row.harvestId, pieces);
    }
    if (balances[row.category] < 0) throw new InventoryConflict("Stok kategori telur tidak cukup pada salah satu tanggal dalam riwayat.");
  }
  return { balances, lots };
}

export function feedConversion(measuredFeed: number | null, measuredEggs: number | null) {
  return measuredFeed && measuredEggs && measuredFeed > 0 && measuredEggs > 0 ? measuredFeed / measuredEggs : null;
}

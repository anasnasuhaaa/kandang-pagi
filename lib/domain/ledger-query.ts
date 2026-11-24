import { z } from "zod";
import { readTableSort, tableParam } from "./table-sort";
import { populationPeriod } from "./population-input";

const querySchema = z.object({
  cari: z.string().trim().max(100).catch(""),
  filter: z.string().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const keys = ["mulai", "akhir", "cari", "filter", "halaman", "urut", "arah"] as const;

export function preserveLedgerParams(raw: Record<string, unknown>, scope?: string): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key) => {
    const name = tableParam(key, scope);
    const value = raw[name];
    return typeof value === "string" ? [[name, value]] : [];
  }));
}

export function ledgerQuery(raw: Record<string, unknown>, scope?: string, defaultPeriod?: { from: string; to: string }) {
  const source = scope ? Object.fromEntries(keys.map((key) => [key, raw[tableParam(key, scope)]])) : raw;
  const period = populationPeriod({ ...source, mulai: source.mulai ?? defaultPeriod?.from, akhir: source.akhir ?? defaultPeriod?.to }, 30);
  const query = querySchema.parse(source);
  return { ...period, search: query.cari, page: query.halaman, filter: query.filter, sort: readTableSort(source) };
}

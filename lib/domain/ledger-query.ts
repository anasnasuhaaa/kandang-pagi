import { z } from "zod";
import { readTableSort } from "./table-sort";
import { populationPeriod } from "./population-input";

const querySchema = z.object({
  cari: z.string().trim().max(100).catch(""),
  filter: z.string().max(100).catch(""),
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export function ledgerQuery(raw: unknown) {
  const period = populationPeriod(raw, 30);
  const query = querySchema.parse(raw);
  return { ...period, search: query.cari, page: query.halaman, filter: query.filter, sort: readTableSort(raw) };
}

import { z } from "zod";

export type DataColumn = {
  key: string;
  label: string;
  variant?: "number" | "date" | "wrap" | "actions";
};

export function tableColumn<K extends string>(key: K, label: string, variant?: DataColumn["variant"]) {
  return { key, label, variant };
}

const sortSchema = z.object({
  urut: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  arah: z.enum(["asc", "desc"]),
});
export type TableSort = { column: string; direction: "asc" | "desc" };
export type SortValue = string | number | bigint | Date | null | undefined | {
  unit: string;
  amount: number | bigint;
};

export function readTableSort(raw: unknown): TableSort | undefined {
  const parsed = sortSchema.safeParse(raw);
  if (parsed.success) return { column: parsed.data.urut, direction: parsed.data.arah };
}

export function nextTableSort(column: string, sort?: TableSort): TableSort | undefined {
  if (sort?.column !== column) return { column, direction: "asc" };
  if (sort.direction === "asc") return { column, direction: "desc" };
}

export function sortParams(sort?: TableSort) {
  return sort ? { urut: sort.column, arah: sort.direction } : { urut: "", arah: "" };
}

export function tableHref(path: string, query: Record<string, string>) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
  return params.size ? `${path}?${params}` : path;
}

const collator = new Intl.Collator("id-ID", { sensitivity: "base", numeric: true });

function compareNumbers(left: number | bigint, right: number | bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareSortValues(left: SortValue, right: SortValue, direction: TableSort["direction"] = "asc"): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  const sign = direction === "desc" ? -1 : 1;
  if (left instanceof Date && right instanceof Date) return sign * compareNumbers(left.getTime(), right.getTime());
  if (typeof left === "object" && "unit" in left && typeof right === "object" && "unit" in right) {
    return sign * (collator.compare(left.unit, right.unit) || compareNumbers(left.amount, right.amount));
  }
  if (typeof left === "string" && typeof right === "string") return sign * collator.compare(left, right);
  if ((typeof left === "number" || typeof left === "bigint") && (typeof right === "number" || typeof right === "bigint")) {
    return sign * compareNumbers(left, right);
  }
  // A dimensioned amount and a textual state can share a composite column.
  const rank = (value: NonNullable<SortValue>) => typeof value === "string" ? 0 : typeof value === "object" ? 2 : 1;
  return sign * (rank(left) - rank(right));
}

export function sortTableRows<T>(rows: T[], direction: TableSort["direction"], value: (row: T) => SortValue) {
  // Stable sorting retains the dataset's established default order for ties.
  return rows.toSorted((left, right) => compareSortValues(value(left), value(right), direction));
}

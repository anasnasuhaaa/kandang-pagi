import { sql, type SQLWrapper } from "drizzle-orm";
import type { Database } from "../../db";
import type { TableSort } from "../../lib/domain/table-sort";

export type SortColumn = { expression: SQLWrapper; text?: boolean };

export function textOrder(expression: SQLWrapper): SortColumn {
  return { expression, text: true };
}

export function labelOrder(expression: SQLWrapper, labels: Readonly<Record<string, string>>): SortColumn {
  const cases = Object.entries(labels).map(([key, label]) => sql`when ${key} then ${label}`);
  return textOrder(sql`case ${expression}::text ${sql.join(cases, sql` `)} else ${expression}::text end`);
}

export async function tableOrder(db: Database, sort: TableSort | undefined, allowed: Record<string, SortColumn>) {
  if (!sort || !Object.hasOwn(allowed, sort.column)) return [];
  const column = allowed[sort.column];
  let expression = column.expression;
  if (column.text) {
    const [locale] = await db.execute<{ available: boolean }>(
      sql`select to_regcollation('pg_catalog."id-x-icu"') is not null as available`,
    );
    expression = locale?.available ? sql`lower(${expression}) collate pg_catalog."id-x-icu"` : sql`lower(${expression})`;
  }
  const direction = sort.direction === "desc" ? sql`desc` : sql`asc`;
  return [sql`${expression} ${direction} nulls last`];
}

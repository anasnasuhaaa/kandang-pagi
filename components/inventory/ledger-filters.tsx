"use client";

import { ListFilter } from "lucide-react";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { DateField } from "@/components/shared/date-field";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { scopeTableParams, sortParams, tableHref, type TableSort } from "@/lib/domain/table-sort";
import { businessDate, shiftBusinessDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { businessDateSchema } from "@/lib/validation";
import type { Choice } from "./ledger-form";

const searchSchema = z.object({
  cari: z.string().trim().max(100, "Gunakan maksimal 100 karakter."),
  filter: z.string().max(100).optional(),
  jenis: z.string().max(100).optional(),
});
const filtersSchema = searchSchema.extend({
  mulai: businessDateSchema, akhir: businessDateSchema,
}).refine(({ mulai, akhir }) => akhir <= businessDate() && mulai <= akhir && mulai >= shiftBusinessDate(akhir, -89),
  "Pilih rentang tanggal berurutan, maksimal 90 hari sampai hari ini.");

export type LedgerKindFilter = { value: string; choices: Choice[] };

export function LedgerFilters({ path, tab, query, choices, filterLabel = "Filter", kind, showPeriod = true, scope, preserve = {} }: {
  path: string; tab: string; query: { from: string; to: string; search: string; filter: string; sort?: TableSort };
  choices: Choice[];
  filterLabel?: string;
  kind?: LedgerKindFilter;
  showPeriod?: boolean;
  scope?: string;
  preserve?: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = (showPeriod ? filtersSchema : searchSchema).safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) return setError(result.error.issues[0].message);
    const { jenis, filter, ...values } = result.data;
    const params = scopeTableParams({ ...values, filter: filter ?? "", jenis: kind ? jenis ?? "" : "" }, scope);
    router.push(tableHref(path, { ...preserve, ...params, ...sortParams(query.sort, scope), tab }), { scroll: false });
    setError("");
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-2" aria-label="Filter catatan">
      <div className={cn("grid min-w-0 gap-3 sm:grid-cols-2 lg:items-end",
        !showPeriod ? "lg:grid-cols-[repeat(2,minmax(0,1fr))_auto]" :
          kind ? "lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]" : "lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]")}>
        {showPeriod && <>
          <DateField name="mulai" label="Dari tanggal (WIB)" defaultValue={query.from} />
          <DateField name="akhir" label="Hingga tanggal (WIB)" defaultValue={query.to} />
        </>}
        {kind && <ChoiceField name="jenis" label="Jenis aktivitas" value={kind.value} choices={[{ value: "", label: "Semua aktivitas" }, ...kind.choices]} />}
        {choices.length > 0 && <ChoiceField name="filter" label={filterLabel} value={query.filter} choices={[{ value: "", label: "Semua" }, ...choices]} />}
        <TextField name="cari" label="Cari catatan" placeholder="Cari" defaultValue={query.search} />
        <Button type="submit" variant="outline" className="min-h-10"><ListFilter aria-hidden="true" />Terapkan filter</Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

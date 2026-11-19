"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { businessDate, shiftBusinessDate } from "@/lib/format";
import { businessDateSchema } from "@/lib/validation";

const filtersSchema = z.object({
  mulai: businessDateSchema, akhir: businessDateSchema, cari: z.string().trim().max(100, "Gunakan maksimal 100 karakter."),
  filter: z.string().max(100).optional(),
}).refine(({ mulai, akhir }) => akhir <= businessDate() && mulai <= akhir && mulai >= shiftBusinessDate(akhir, -89),
  "Pilih rentang tanggal berurutan, maksimal 90 hari sampai hari ini.");

export function LedgerFilters({ path, tab, query, choices }: {
  path: string; tab: string; query: { from: string; to: string; search: string; filter: string };
  choices: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = filtersSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) return setError(result.error.issues[0].message);
    const values = result.data;
    router.push(`${path}?${new URLSearchParams({ ...values, filter: values.filter ?? "", tab })}`, { scroll: false });
    setError("");
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-2" aria-label="Filter catatan">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <TextField name="mulai" label="Dari tanggal (WIB)" type="date" defaultValue={query.from} />
        <TextField name="akhir" label="Hingga tanggal (WIB)" type="date" defaultValue={query.to} />
        {choices.length > 0 && <ChoiceField name="filter" label="Filter" value={query.filter} choices={[{ value: "", label: "Semua" }, ...choices]} />}
        <TextField name="cari" label="Cari catatan" placeholder="Cari" defaultValue={query.search} />
        <Button type="submit" variant="outline" className="h-10">Terapkan filter</Button>
      </div>
      <FormError message={error} />
    </form>
  );
}

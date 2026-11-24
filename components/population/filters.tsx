"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { DateField } from "@/components/shared/date-field";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { shiftBusinessDate } from "@/lib/format";
import { businessDateSchema } from "@/lib/validation";
import { periodSchema } from "@/lib/domain/population-input";

type Choice = { value: string; label: string };
const filterSchema = periodSchema.extend({
  mulai: businessDateSchema, akhir: businessDateSchema,
  cari: z.string().trim().max(100, "Gunakan maksimal 100 karakter.").optional(),
  tab: z.enum(["kandang", "kelompok", "mutasi", "riwayat"]).optional(),
}).refine(({ mulai, akhir }) => mulai <= akhir && mulai >= shiftBusinessDate(akhir, -89), {
  path: ["mulai"], message: "Pilih rentang tanggal berurutan, maksimal 90 hari.",
});

export function PopulationFilters({
  path, tab, from, to, search, barnId, flockId, barns, flocks, today,
}: {
  path: string; tab?: "kandang" | "kelompok" | "mutasi" | "riwayat"; from: string; to: string; search?: string;
  barnId?: string; flockId?: string; barns: Choice[]; flocks: Choice[]; today: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = filterSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!values.success || values.data.akhir > today) {
      setError(values.success ? "Tanggal akhir tidak boleh melewati hari ini." : values.error.issues[0].message);
      return;
    }
    setError("");
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values.data)) if (value) query.set(key, value);
    router.push(`${path}?${query}`, { scroll: false });
  }

  return (
    <form noValidate className="space-y-3" onSubmit={submit} aria-label="Filter catatan">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end">
        <DateField name="mulai" label="Tanggal mulai (WIB)" max={today} defaultValue={from} />
        <DateField name="akhir" label="Tanggal akhir (WIB)" max={today} defaultValue={to} />
        <ChoiceField name="kandang" label="Kandang" value={barnId ?? ""} choices={[{ value: "", label: "Semua kandang" }, ...barns]} />
        <ChoiceField name="kelompok" label="Kelompok" value={flockId ?? ""} choices={[{ value: "", label: "Semua kelompok" }, ...flocks]} />
        <div className="flex min-w-0 flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-1">
          {search !== undefined && <div className="min-w-0 flex-1"><TextField name="cari" label="Cari" placeholder="Nama atau kode" defaultValue={search} /></div>}
          <Button type="submit" variant="outline" className="h-10">Terapkan filter</Button>
        </div>
      </div>
      <FormError message={error} />
    </form>
  );
}

"use client";

import { ListFilter } from "lucide-react";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DateField } from "@/components/shared/date-field";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { categoryLabels } from "@/lib/domain/production-input";
import { cashFilterLabels, reportNames, reportQuerySchema, type ReportFamily, type ReportInput } from "@/lib/domain/report";
import { resellerCategoryLabels } from "@/lib/domain/reseller";
import type { ReportFilters as Options } from "@/server/services/reports";

const all = { value: "", label: "Semua" };

export function ReportFilters({ selected, options, from, to }: {
  selected: ReportInput & { jenis: ReportFamily }; options: Options; from: string; to: string;
}) {
  const router = useRouter();
  const [family, setFamily] = useState(selected.jenis);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = reportQuerySchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) return setMessage(parsed.error.issues[0].message);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed.data)) if (value) query.set(key, value);
    setMessage("");
    router.push(`/laporan?${query}`, { scroll: false });
  }

  const categories = Object.entries(family === "reseller" ? resellerCategoryLabels : categoryLabels).map(([value, label]) => ({ value, label }));
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ChoiceField name="jenis" label="Jenis laporan" value={family}
          choices={options.families.map((value) => ({ value, label: reportNames[value] }))}
          onValueChange={(value) => { if (value && options.families.includes(value as ReportFamily)) setFamily(value as ReportFamily); }} />
        <DateField name="mulai" label="Mulai (WIB)" defaultValue={from} />
        <DateField name="akhir" label="Akhir (WIB)" defaultValue={to} />
        {family === "operasional" && <>
          <ChoiceField name="kandang" label="Kandang" value={selected.kandang ?? ""} choices={[all, ...options.barns]} />
          <ChoiceField name="kelompok" label="Kelompok" value={selected.kelompok ?? ""} choices={[all, ...options.flocks]} />
        </>}
        {family !== "keuangan" && <ChoiceField name="kategori" label="Kategori telur" value={selected.kategori ?? ""} choices={[all, ...categories]} />}
        {family !== "operasional" && <ChoiceField name="transaksi" label="Jenis kas" value={selected.transaksi ?? ""} choices={[
          all, ...Object.entries(cashFilterLabels).map(([value, label]) => ({ value, label })),
        ]} />}
        <TextField name="cari" label="Pencarian rincian" placeholder="Ketik kata kunci" defaultValue={selected.cari ?? ""} />
      </div>
      <FormError message={message} />
      <Button type="submit" variant="outline" className="min-h-10"><ListFilter aria-hidden="true" />Terapkan filter</Button>
    </form>
  );
}

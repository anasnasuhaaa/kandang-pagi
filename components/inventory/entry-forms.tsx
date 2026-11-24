"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, type FieldErrors } from "@/components/shared/form-fields";
import {
  categoryLabels, eggAdjustmentSchema, feedAdjustmentSchema, feedClosingSchema, feedIssueSchema,
  feedMixSchema, feedOpeningSchema, feedPurchaseSchema, gradingSchema, harvestSchema, productSchema, saleSchema, sortedCategories,
} from "@/lib/domain/production-input";
import { formatIDR, formatQuantity } from "@/lib/format";
import { kilogramsSchema, rupiahSchema } from "@/lib/validation";
import {
  adjustEggsAction, adjustFeedAction, buyFeedAction, closeFeedAction, createProductAction, gradeEggsAction,
  harvestEggsAction, issueFeedAction, mixFeedAction, openFeedAction, sellEggsAction,
} from "@/server/services/inventory-actions";
import { amountField, dateField, LedgerFields, LedgerForm, selectField, textField, type Choice, type LedgerField, type RawForm } from "./ledger-form";

const kinds = [{ value: "ingredient", label: "Bahan pakan" }, { value: "complete", label: "Pakan siap pakai" }, { value: "mixed", label: "Pakan campuran" }];
const categoryChoices = sortedCategories.map((value) => ({ value, label: categoryLabels[value] }));
const signChoices = [{ value: "increase", label: "Tambah stok" }, { value: "decrease", label: "Kurangi stok" }];
const barnOrWarehouse = (barns: Choice[]) => [{ value: "", label: "Gudang" }, ...barns];
const notes = textField("note", "Catatan (opsional)", "");
const reason = textField("note", "Alasan pencatatan");
const grams = amountField("grams", "Berat (kg)", undefined, true);
type FeedProps = { today: string; products: Choice[]; barns: Choice[] };
type FeedActivityTrigger = { triggerVariant?: React.ComponentProps<typeof Button>["variant"] };
type EggProps = { today: string; barns: Choice[]; flocks: Choice[]; lots: Choice[] };

export function ProductForm() {
  return <LedgerForm title="Tambah jenis pakan" description="Beri kode dan nama untuk pakan atau bahan yang akan dicatat."
    schema={productSchema} action={createProductAction} fields={[textField("code", "Kode pakan"), textField("name", "Nama pakan"), selectField("kind", "Jenis", kinds)]} />;
}

export function FeedOpeningForm({ today, products, barns }: FeedProps) {
  return <LedgerForm title="Catat saldo awal pakan" triggerVariant="outline" description="Masukkan stok terukur sebelum pergerakan pertama untuk produk dan lokasi ini."
    schema={feedOpeningSchema} action={openFeedAction} fields={[dateField(today), selectField("productId", "Pakan", products),
      selectField("barnId", "Lokasi stok", barnOrWarehouse(barns), ""), grams, amountField("value", "Nilai persediaan (Rp)", "0"), reason]} />;
}

export function FeedPurchaseForm({ today, products, triggerVariant }: Omit<FeedProps, "barns"> & FeedActivityTrigger) {
  return <LedgerForm title="Catat pembelian pakan" triggerVariant={triggerVariant} description="Catat penerimaan yang sudah dibayar penuh dan tambahkan stok gudang."
    schema={feedPurchaseSchema} action={buyFeedAction} fields={[dateField(today), selectField("productId", "Pakan", products), textField("supplier", "Pemasok"),
      grams, amountField("total", "Total dibayar (Rp)"), notes]}
    confirm="Penerimaan menambah stok gudang dan membukukan satu pengeluaran."
    renderExtra={(_errors, values) => {
      const weight = kilogramsSchema.safeParse(values.grams);
      const cost = rupiahSchema.safeParse(values.total);
      if (!weight.success || !weight.data || !cost.success) return null;
      return <p className="text-sm text-muted-foreground">Perkiraan harga per kg: {formatIDR(cost.data * BigInt(1000) / BigInt(weight.data))}</p>;
    }} />;
}

export function FeedIssueForm({ today, products, barns, triggerVariant }: FeedProps & FeedActivityTrigger) {
  return <LedgerForm title="Kirim ke kandang" triggerVariant={triggerVariant} description="Pindahkan pakan dari gudang ke kandang yang dipilih."
    schema={feedIssueSchema} action={issueFeedAction} fields={[dateField(today), selectField("productId", "Pakan", products),
      selectField("barnId", "Kandang tujuan", barns), grams, notes]} confirm="Stok gudang berkurang dan stok kandang bertambah sesuai berat yang dimasukkan." />;
}

export function FeedClosingForm({ today, products, barns, selection }: FeedProps & {
  selection?: { productId: string; barnId: string };
}) {
  return <LedgerForm title="Catat sisa harian" triggerVariant={selection ? "outline" : undefined}
    description="Masukkan hasil pengukuran akhir hari untuk satu jenis pakan di satu kandang."
    schema={feedClosingSchema} action={closeFeedAction} fields={[dateField(today), selectField("productId", "Pakan", products, selection?.productId),
      selectField("barnId", "Kandang", barns, selection?.barnId), amountField("closing", "Sisa terukur (kg)", undefined, true),
      amountField("waste", "Pakan terbuang (kg)", "0", true), amountField("returned", "Dikembalikan ke gudang (kg)", "0", true), notes]} />;
}

export function FeedAdjustmentForm({ today, products, barns }: FeedProps) {
  return <LedgerForm title="Sesuaikan stok pakan" triggerVariant="outline" description="Catat selisih fisik untuk lokasi dan tanggal yang dipilih."
    schema={feedAdjustmentSchema} action={adjustFeedAction} fields={[dateField(today), selectField("productId", "Pakan", products),
      selectField("barnId", "Lokasi stok", barnOrWarehouse(barns), ""), selectField("direction", "Jenis penyesuaian", signChoices),
      grams, reason]} confirm="Penyesuaian mengubah saldo historis. Pencatatan diperiksa terhadap seluruh riwayat yang terkait." />;
}

function EntryRows({ initial, maximum, minimum = initial, label, error, fields, update }: {
  initial: number; maximum: number; minimum?: number; label: string; error?: string[];
  fields: (index: string) => LedgerField[]; update: (name: string, value: string) => void;
}) {
  const [rows, setRows] = useState(Array.from({ length: initial }, (_, index) => String(index)));
  const [next, setNext] = useState(initial);
  return (
    <div className="space-y-3">
      {rows.map((index, position) => (
        <fieldset key={index} className="min-w-0 space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{label} {position + 1}</legend>
          <LedgerFields fields={fields(index)} errors={{}} update={update} />
          {rows.length > minimum && <Button type="button" variant="ghost" onClick={() => {
            for (const field of fields(index)) update(field.name, "");
            setRows(rows.filter((row) => row !== index));
          }}>Hapus baris</Button>}
        </fieldset>
      ))}
      {rows.length < maximum && <Button type="button" variant="outline" onClick={() => {
        setRows([...rows, String(next)]);
        setNext(next + 1);
      }}>Tambah baris</Button>}
      <FormError message={error?.[0] ?? ""} />
    </div>
  );
}

function grouped(raw: RawForm, anchor: string, fields: string[]) {
  return Object.keys(raw).filter((key) => key.startsWith(`${anchor}:`)).map((key) => {
    const [, index] = key.split(":");
    return Object.fromEntries(fields.map((field) => [field, raw[`${field}:${index}`]]));
  });
}

export function FeedMixForm({ today, products, outputs, triggerVariant }: Omit<FeedProps, "barns"> & FeedActivityTrigger & { outputs: Choice[] }) {
  return <LedgerForm title="Buat campuran pakan" triggerVariant={triggerVariant} description="Gunakan stok gudang dan catat berat aktual hasil campuran."
    schema={feedMixSchema} action={mixFeedAction} fields={[dateField(today), selectField("productId", "Pakan hasil campuran", outputs),
      amountField("output", "Berat hasil (kg)", undefined, true), notes]}
    prepare={(raw) => ({ ...raw, ingredients: grouped(raw, "productId", ["productId", "grams"]) })}
    confirm="Stok bahan dikurangi, stok hasil campuran ditambahkan, dan selisih berat dicatat sebagai susut."
    renderExtra={(errors, values, update) => {
      const input = grouped(values, "grams", ["grams"]).reduce((sum, line) => {
        const result = kilogramsSchema.safeParse(line.grams);
        return sum + (result.success ? result.data : 0);
      }, 0);
      return <>
        <EntryRows initial={2} maximum={12} label="Bahan" error={errors.ingredients} update={update}
          fields={(index) => [selectField(`productId:${index}`, "Bahan pakan", products), amountField(`grams:${index}`, "Berat bahan (kg)", undefined, true)]} />
        {!!input && <p className="text-sm text-muted-foreground">Total bahan: {formatQuantity(input / 1000)} kg</p>}
      </>;
    }} />;
}

export function HarvestForm({ today, barns, flocks }: Omit<EggProps, "lots">) {
  return <LedgerForm title="Catat panen telur" description="Hitung seluruh telur termasuk yang cacat. Timbang seluruh hasil yang dapat ditimbang."
    schema={harvestSchema} action={harvestEggsAction} initial={{ attribution: "flock" }}
    fields={[dateField(today), selectField("barnId", "Kandang", barns), selectField("attribution", "Asal panen", [
      { value: "flock", label: "Kelompok diketahui" }, { value: "mixed", label: "Panen campuran kandang" },
    ], "flock"), amountField("count", "Jumlah panen (butir)"), amountField("weighed", "Berat aktual (kg)", undefined, true),
    selectField("massStatus", "Kelengkapan timbangan", [{ value: "complete", label: "Semua dapat ditimbang" }, { value: "incomplete", label: "Penimbangan belum lengkap" }], "complete"), notes]}
    renderExtra={(errors, values, update) => values.attribution === "flock"
      ? <LedgerFields fields={[selectField("flockId", "Kelompok ternak", flocks)]} errors={errors} update={update} />
      : <p className="text-sm/6 text-muted-foreground">Panen campuran dicatat untuk kandang. Angkanya tidak dibagikan ke kelompok tertentu.</p>} />;
}

export function GradeForm({ today, lots }: Pick<EggProps, "today" | "lots">) {
  return <LedgerForm title="Catat sortir telur" description="Pilih lot asal dan masukkan jumlah per kategori. Masukkan telur cacat hanya pada kategori Cacat."
    schema={gradingSchema} action={gradeEggsAction} fields={[dateField(today), selectField("harvestId", "Lot panen belum disortir", lots),
      ...sortedCategories.map((key) => amountField(key, `${categoryLabels[key]} (butir)`, "0")), notes]}
    confirm="Jumlah yang disortir dipindahkan dari lot panen ke kategori yang dipilih." />;
}

export function SaleForm({ today, categories }: { today: string; categories: Choice[] }) {
  return <LedgerForm title="Catat penjualan lunas" description="Pilih kategori telur yang sudah disortir dan masukkan pembayaran penuh."
    schema={saleSchema} action={sellEggsAction} fields={[dateField(today), textField("buyer", "Nama pembeli (opsional)", ""), amountField("paid", "Pembayaran diterima (Rp)"), notes]}
    prepare={(raw) => ({ ...raw, lines: grouped(raw, "category", ["category", "count", "price"]) })}
    confirm="Stok telur berkurang. Nilai yang dibayar dibukukan sebagai satu pemasukan kas."
    renderExtra={(errors, values, update) => {
      const total = grouped(values, "price", ["price", "count"]).reduce((sum, row) => {
        const quantity = typeof row.count === "string" && /^\d{1,8}$/.test(row.count) ? BigInt(row.count) : BigInt(0);
        const amount = rupiahSchema.safeParse(row.price);
        return sum + (amount.success ? quantity * amount.data : BigInt(0));
      }, BigInt(0));
      return <>
        <EntryRows initial={1} maximum={3} label="Rincian telur" error={errors.lines} update={update}
          fields={(index) => [selectField(`category:${index}`, "Kategori", categories), amountField(`count:${index}`, "Jumlah (butir)"),
            amountField(`price:${index}`, "Harga per butir (Rp)")]}/>
        <p className="text-sm font-medium">Total penjualan: {formatIDR(total)}</p>
      </>;
    }} />;
}

export function EggAdjustmentForm({ today, lots, administrator }: { today: string; lots: Choice[]; administrator: boolean }) {
  const availableModes = [{ value: "loss", label: "Telur hilang atau dibuang" }, ...(administrator ? [{ value: "opening", label: "Saldo awal" }, ...signChoices] : [])];
  return <LedgerForm title={administrator ? "Sesuaikan stok telur" : "Catat telur dibuang"} description="Catat telur yang hilang atau selisih hasil pemeriksaan fisik."
    schema={eggAdjustmentSchema} action={adjustEggsAction} fields={[dateField(today),
      selectField("mode", "Jenis pergerakan", availableModes, "loss"),
      selectField("category", "Kategori telur", [{ value: "ungraded", label: categoryLabels.ungraded }, ...categoryChoices]),
      amountField("count", "Jumlah (butir)"), reason]}
    renderExtra={(errors: FieldErrors, values, update) => values.category === "ungraded"
      ? <LedgerFields fields={[selectField("harvestId", "Lot panen", lots)]} errors={errors} update={update} /> : null}
    confirm="Pergerakan ini mengubah stok telur dan dicatat dalam riwayat." />;
}

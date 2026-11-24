"use client";

import {
  amountField, dateField, LedgerFields, LedgerForm, selectField, textField,
} from "@/components/inventory/ledger-form";
import {
  categories, resellerAdjustmentSchema, resellerCancelSchema, resellerCashOpeningSchema, resellerCashSchema,
  resellerCategoryLabels, resellerSaleSchema, resellerTransactionSchema, unitDefinitionSchema,
} from "@/lib/domain/reseller";
import { formatQuantity } from "@/lib/format";
import {
  adjustStockAction, cancelResellerAction, defineUnitAction, intakeAction, openResellerCashAction, postResellerCashAction, resellerSaleAction,
} from "@/server/services/reseller-actions";

const categoryChoices = categories.map((value) => ({ value, label: resellerCategoryLabels[value] }));
const note = textField("note", "Catatan (opsional)", "");
const reason = textField("note", "Alasan pencatatan");
export type UnitOption = { id: string; code: string; name: string; active: boolean; piecesPerUnit: number; effectiveDate: string };

export function ResellerTradeForm({ today, units, sale }: { today: string; units: UnitOption[]; sale: boolean }) {
  return <LedgerForm title={sale ? "Catat penjualan reseller" : "Catat stok masuk"}
    description={sale ? "Masukkan penjualan dengan pembayaran tunai penuh." : "Catat stok yang diterima langsung oleh usaha reseller."}
    schema={sale ? resellerSaleSchema : resellerTransactionSchema} action={sale ? resellerSaleAction : intakeAction}
    initial={{ unit: "pieces" }} fields={[
      dateField(today), selectField("category", "Kategori telur", categoryChoices),
      selectField("unit", "Satuan pencatatan", [
        { value: "pieces", label: "Butir" }, { value: "packaging", label: "Kemasan" }, { value: "kg", label: "Kilogram (kg)" },
      ], "pieces"),
      amountField("amount", sale ? "Pembayaran penuh diterima (Rp)" : "Biaya yang dibayar (Rp)", sale ? undefined : "0"), note,
    ]}
    confirm={sale ? "Penjualan mengurangi stok dan membukukan satu pemasukan reseller." : "Penerimaan menambah stok. Biaya yang dibayar dibukukan sebagai satu pengeluaran."}
    renderExtra={(errors, values, update) => {
      if (values.unit === "kg") return <>
        <LedgerFields fields={[amountField("weight", "Berat aktual (kg)", undefined, true), amountField("pieces", "Jumlah aktual (butir)")]} errors={errors} update={update} />
        <p className="text-sm text-muted-foreground">Timbang telur dan hitung butir secara terpisah.</p>
      </>;
      if (values.unit === "packaging") {
        const date = typeof values.businessDate === "string" ? values.businessDate : today;
        const byCode = new Map<string, UnitOption>();
        for (const item of units) {
          if (item.effectiveDate <= date && !byCode.has(item.code)) byCode.set(item.code, item);
        }
        const labels = [...byCode.values()].filter(({ active }) => active).map((item) => ({
          value: item.id, label: `${item.name} · ${formatQuantity(item.piecesPerUnit)} butir`,
        }));
        return labels.length ? <LedgerFields fields={[
          selectField("unitId", "Kemasan", labels), amountField("unitCount", "Jumlah kemasan"),
        ]} errors={errors} update={update} /> : <p className="text-sm text-muted-foreground">Tambahkan konversi aktif pada tab Satuan.</p>;
      }
      return <LedgerFields fields={[amountField("pieces", "Jumlah (butir)")]} errors={errors} update={update} />;
    }} />;
}

export function UnitDefinitionForm({ today, unit }: { today: string; unit?: UnitOption }) {
  return <LedgerForm title={unit ? "Buat versi satuan" : "Tambah satuan kemasan"}
    description="Tentukan jumlah butir per kemasan dan tanggal mulai berlakunya."
    schema={unitDefinitionSchema} action={defineUnitAction}
    fields={[
      dateField(today), textField("code", "Kode satuan", unit?.code), textField("name", "Nama satuan", unit?.name),
      amountField("piecesPerUnit", "Butir per kemasan", unit ? String(unit.piecesPerUnit) : undefined),
      selectField("status", "Status", [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }], "active"),
    ]} />;
}

export function ResellerStockAdjustmentForm({ today }: { today: string }) {
  return <LedgerForm title="Catat saldo atau penyesuaian stok" description="Masukkan saldo awal atau selisih fisik pada tanggal yang dipilih."
    schema={resellerAdjustmentSchema} action={adjustStockAction}
    fields={[
      dateField(today), selectField("category", "Kategori telur", categoryChoices), amountField("pieces", "Jumlah (butir)"),
      selectField("mode", "Jenis catatan", [{ value: "opening", label: "Saldo awal" }, { value: "change", label: "Penyesuaian" }], "change"),
      selectField("direction", "Arah penyesuaian", [{ value: "increase", label: "Tambah stok" }, { value: "decrease", label: "Kurangi stok" }], "increase"), reason,
    ]} confirm="Saldo stok pada tanggal ini akan diperiksa terhadap catatan berikutnya." />;
}

export function ResellerCashForm({ today, opening }: { today: string; opening?: boolean }) {
  return <LedgerForm title={opening ? "Catat saldo awal kas" : "Tambah transaksi kas"}
    description={opening ? "Catat dana yang sudah tersedia sebelum transaksi usaha." : "Catat pemasukan atau pengeluaran yang berdiri sendiri."}
    schema={opening ? resellerCashOpeningSchema : resellerCashSchema} action={opening ? openResellerCashAction : postResellerCashAction}
    fields={[
      dateField(today), amountField("amount", "Jumlah (Rp)"),
      ...(opening ? [reason] : [
        textField("category", "Kategori"),
        selectField("direction", "Jenis transaksi", [{ value: "income", label: "Pemasukan" }, { value: "expense", label: "Pengeluaran" }]), note,
      ]),
    ]} confirm="Jumlah yang dicatat akan memengaruhi saldo kas usaha reseller." />;
}

export function CancelResellerForm({ id }: { id: string }) {
  return <LedgerForm destructive title="Batalkan catatan" description="Pembatalan membukukan pergerakan pembalik dan menyimpan catatan asli."
    schema={resellerCancelSchema} action={cancelResellerAction} fields={[textField("reason", "Alasan pembatalan")]}
    prepare={(raw) => ({ ...raw, id })} confirm="Saldo stok dan kas pada tanggal transaksi akan dihitung sesuai pembatalan." />;
}

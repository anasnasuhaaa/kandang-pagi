"use client";

import { LedgerForm, amountField, dateField, textField } from "@/components/inventory/ledger-form";
import { cashOpeningSchema, manualCashSchema } from "@/lib/domain/finance-input";
import { openCashAction, postCashAction } from "@/server/services/workflow-actions";

export function CashOpeningForm({ today }: { today: string }) {
  return <LedgerForm title="Catat saldo awal kas" description="Masukkan dana yang sudah tersedia sebelum mencatat arus kas usaha."
    fields={[dateField(today), amountField("amount", "Saldo awal (Rp)"), textField("note", "Alasan pencatatan")]}
    schema={cashOpeningSchema} action={openCashAction}
    confirm="Saldo awal menambah saldo kas pada tanggal yang dipilih." />;
}

export function ManualCashForm({ today, direction }: { today: string; direction: "income" | "expense" }) {
  const title = direction === "income" ? "Tambah pemasukan" : "Tambah pengeluaran";
  return <LedgerForm title={title} description="Gunakan untuk transaksi kas mandiri. Pembelian pakan dan penjualan telur memiliki pencatatan otomatis."
    fields={[dateField(today), textField("category", "Kategori"), amountField("amount", "Jumlah (Rp)"), textField("note", "Catatan (opsional)", "")]}
    schema={manualCashSchema} action={postCashAction} prepare={(raw) => ({ ...raw, direction })}
    confirm="Transaksi ini akan tercatat di buku kas. Bukti foto dapat ditambahkan setelah tersimpan." />;
}

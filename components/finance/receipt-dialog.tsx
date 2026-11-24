"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useRowAction } from "@/components/shared/row-actions";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormError } from "@/components/shared/form-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { receiptFileError, receiptMime } from "@/lib/receipts";
import { reconcileReceiptsAction } from "@/server/services/workflow-actions";

const historySchema = z.array(z.object({ id: z.uuid(), status: z.enum(["active", "replaced"]), at: z.iso.datetime() }));
type History = z.infer<typeof historySchema>;
const time = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });

export function ReceiptDialog({ cashId, uploadAllowed, active, mode }: { cashId: string; uploadAllowed: boolean; active: boolean; mode: "view" | "upload" }) {
  const router = useRouter();
  const fieldId = useId();
  const rowAction = useRowAction();
  const open = rowAction?.open ?? false;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [requestId, setRequestId] = useState("");
  const [history, setHistory] = useState<History>([]);
  const path = `/api/bukti/${cashId}`;

  useEffect(() => {
    if (!open || mode !== "view") return;
    const controller = new AbortController();
    void fetch(`${path}?riwayat=1`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Riwayat tidak tersedia");
        setHistory(historySchema.parse(await response.json()));
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("Riwayat bukti tidak dapat dimuat."); });
    return () => controller.abort();
  }, [open, path, mode]);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  async function upload() {
    if (!file || receiptFileError(file.type, file.size)) return;
    setPending(true);
    setMessage("");
    try {
      const result = await fetch(path, { method: "POST", headers: { "Content-Type": file.type, "X-Request-Id": requestId }, body: file });
      if (!result.ok) {
        const error = z.object({ message: z.string() }).safeParse(await result.json().catch(() => null));
        setMessage(error.success ? error.data.message : "Bukti gagal disimpan.");
        return;
      }
      toast.success("Bukti transaksi disimpan.");
      setFile(undefined);
      setPreview("");
      rowAction?.close();
      router.refresh();
    } catch {
      setMessage("Tidak dapat terhubung. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return <FormDialog open={open} onOpenChange={(value) => {
    if (pending) return;
    if (!value) rowAction?.close();
    if (!value) { setMessage(""); setFile(undefined); setPreview(""); setHistory([]); }
  }} title={mode === "view" ? "Bukti transaksi" : active ? "Ganti bukti" : "Tambah bukti"} description="Foto dapat dibuka oleh pengguna yang memiliki akses keuangan.">
    <div className="space-y-4">
      {history.map((item) => (
        <Link key={item.id} className={buttonVariants({ variant: "outline" })} href={`${path}?versi=${item.id}`} target="_blank" rel="noreferrer" prefetch={false}>
          {item.status === "active" ? "Lihat bukti aktif" : "Lihat versi lama"} · {time.format(new Date(item.at))}
        </Link>
      ))}
      {uploadAllowed && mode === "upload" && <>
        <Field>
          <FieldLabel htmlFor={fieldId}>{active ? "Pilih foto pengganti" : "Pilih foto bukti"}</FieldLabel>
          <Input id={fieldId} type="file" accept={receiptMime.options.join(",")} disabled={pending} onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            const error = selected ? receiptFileError(selected.type, selected.size) : null;
            setMessage(error ?? "");
            setFile(error ? undefined : selected);
            setPreview(selected && !error ? URL.createObjectURL(selected) : "");
            setRequestId(crypto.randomUUID());
          }} />
        </Field>
        {preview && <Image src={preview} alt="Pratinjau bukti transaksi" width={480} height={320} unoptimized className="max-h-52 w-full rounded-lg border object-contain" />}
        <Button type="button" onClick={upload} disabled={!file || pending}>{pending ? "Mengunggah…" : active ? "Ganti bukti" : "Simpan bukti"}</Button>
      </>}
      <FormError message={message} />
    </div>
  </FormDialog>;
}

export function CleanupReceipts() {
  const [pending, setPending] = useState(false);
  return <Button type="button" variant="outline" disabled={pending} onClick={async () => {
    setPending(true);
    try {
      const result = await reconcileReceiptsAction();
      if (result.ok) toast.success(`${result.value.cleared} dari ${result.value.inspected} unggahan tertunda dibersihkan.`);
      else toast.error(result.message);
    } catch {
      toast.error("Pemeriksaan unggahan gagal.");
    } finally {
      setPending(false);
    }
  }}>{pending ? "Memeriksa…" : "Periksa unggahan tertunda"}</Button>;
}

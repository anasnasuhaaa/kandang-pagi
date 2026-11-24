"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import {
  addMovementAction, cancelMovementAction, createBarnAction, createFlockAction, setBarnStatusAction,
} from "@/app/(workspace)/populasi/actions";
import { FormDialog } from "@/components/shared/form-dialog";
import { DateField } from "@/components/shared/date-field";
import { ChoiceField, FormError, TextField } from "@/components/shared/form-fields";
import { useValidatedForm } from "@/components/shared/use-validated-form";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { barnSchema, barnStatusSchema, cancelMovementSchema, flockSchema, movementLabels, movementSchema } from "@/lib/domain/population-input";
import type { ActionResult } from "@/server/auth/actions";

type Choice = { value: string; label: string };
const placementKinds = [{ value: "opening", label: "Saldo awal" }, { value: "arrival", label: "Kedatangan baru" }];
const movementKinds = (["death", "cull", "exit", "transfer"] as const).map((value) => ({ value, label: movementLabels[value] }));

function useRecord<T, Result>(
  schema: z.ZodType<T>,
  mutation: (raw: unknown) => Promise<ActionResult<Result>>,
  onDone: () => void,
) {
  const router = useRouter();
  return useValidatedForm(schema, (_values, raw) => mutation(raw), () => {
    onDone();
    toast.success("Pencatatan berhasil disimpan.");
    router.refresh();
  });
}

export function BarnForm() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const form = useRecord(barnSchema, createBarnAction, () => setOpen(false));
  return (
    <FormDialog open={open} onOpenChange={(value) => { if (value) setKey(crypto.randomUUID()); setOpen(value); }}
      title="Tambah kandang" description="Buat identitas kandang untuk penempatan kelompok ternak.">
      <form noValidate onSubmit={form.submit} className="space-y-4">
        <input type="hidden" name="requestKey" value={key} />
        <TextField name="code" label="Kode kandang" error={form.errors.code} />
        <TextField name="name" label="Nama kandang" error={form.errors.name} />
        <TextField name="location" label="Catatan lokasi (opsional)" error={form.errors.location} />
        <FormError message={form.message} />
        <Button type="submit" className="h-10" disabled={form.pending}>Simpan kandang</Button>
      </form>
    </FormDialog>
  );
}

export function FlockForm({ barns, today }: { barns: Choice[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const form = useRecord(flockSchema, createFlockAction, () => setOpen(false));
  return (
    <FormDialog open={open} onOpenChange={(value) => { if (value) setKey(crypto.randomUUID()); setOpen(value); }}
      title="Tambah kelompok" description="Catat kelompok baru serta jumlah awal untuk perhitungan HHP.">
      <form noValidate onSubmit={form.submit} className="space-y-4">
        <input type="hidden" name="requestKey" value={key} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="code" label="Kode kelompok" error={form.errors.code} />
          <TextField name="name" label="Nama kelompok" error={form.errors.name} />
          <ChoiceField name="barnId" label="Kandang penempatan" choices={barns} error={form.errors.barnId} />
          <ChoiceField name="kind" label="Jenis penempatan" choices={placementKinds} value="arrival" error={form.errors.kind} />
          <DateField name="businessDate" label="Tanggal penempatan (WIB)" defaultValue={today} max={today} error={form.errors.businessDate} />
          <TextField name="origin" label="Asal ternak" error={form.errors.origin} />
          <TextField name="count" label="Jumlah awal (ekor)" inputMode="numeric" error={form.errors.count} />
          <TextField name="age" label="Umur awal (hari)" inputMode="numeric" error={form.errors.age} />
        </div>
        <TextField name="reason" label="Alasan penempatan" error={form.errors.reason} />
        <FormError message={form.message} />
        <Button type="submit" className="h-10" disabled={form.pending}>Simpan kelompok</Button>
      </form>
    </FormDialog>
  );
}

export function MovementForm({ barns, flocks, today }: { barns: Choice[]; flocks: Choice[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [transfer, setTransfer] = useState(false);
  const form = useRecord(movementSchema, addMovementAction, () => setOpen(false));
  return (
    <FormDialog open={open} onOpenChange={(value) => {
      if (value) { setKey(crypto.randomUUID()); setTransfer(false); }
      setOpen(value);
    }} title="Catat mutasi" description="Pilih kelompok, tanggal, dan jenis perubahan populasi.">
      <form noValidate onSubmit={form.submit} className="space-y-4">
        <input type="hidden" name="requestKey" value={key} />
        <ChoiceField name="flockId" label="Kelompok ternak" choices={flocks} error={form.errors.flockId} />
        <DateField name="businessDate" label="Tanggal mutasi (WIB)" defaultValue={today} max={today} error={form.errors.businessDate} />
        <ChoiceField name="kind" label="Jenis mutasi" choices={movementKinds} value="death" onValueChange={(value) => setTransfer(value === "transfer")} error={form.errors.kind} />
        {transfer ? <>
          <ChoiceField name="toBarnId" label="Kandang tujuan" choices={barns} error={form.errors.toBarnId} />
          <p className="text-sm/6 text-muted-foreground">Semua ternak hidup dalam kelompok ini dipindahkan bersama.</p>
        </> : <TextField name="count" label="Jumlah (ekor)" inputMode="numeric" error={form.errors.count} />}
        <TextField name="reason" label="Alasan mutasi" error={form.errors.reason} />
        <FormError message={form.message} />
        <Button type="submit" className="h-10" disabled={form.pending}>Simpan mutasi</Button>
      </form>
    </FormDialog>
  );
}

function ReasonDialog({ title, detail, schema, mutation, children, destructive }: {
  title: string;
  detail: string;
  schema: z.ZodType;
  mutation: (raw: unknown) => Promise<ActionResult<unknown>>;
  children: (key: string) => ReactNode;
  destructive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const form = useRecord(schema, mutation, () => setOpen(false));
  return (
    <AlertDialog open={open} onOpenChange={(value) => { if (value) setKey(crypto.randomUUID()); setOpen(value); }}>
      <AlertDialogTrigger render={<Button variant="outline" />}>{title}</AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{detail}</AlertDialogDescription></AlertDialogHeader>
        <form noValidate onSubmit={form.submit} className="space-y-4">
          {children(key)}
          <TextField name="reason" label="Alasan" error={form.errors.reason} />
          <FormError message={form.message} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={form.pending}>Kembali</AlertDialogCancel>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={form.pending}>Konfirmasi</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const barnStatusFormSchema = barnStatusSchema.extend({ active: z.enum(["true", "false"]).transform((value) => value === "true") });

export function BarnStatusAction({ barnId, name, active }: { barnId: string; name: string; active: boolean }) {
  return (
    <ReasonDialog title={active ? "Nonaktifkan" : "Aktifkan kembali"} detail={active ? `Nonaktifkan ${name} untuk penempatan baru. Riwayat kandang tetap tersimpan.` : `Buka kembali ${name} untuk penempatan ternak.`}
      schema={barnStatusFormSchema} mutation={(raw) => setBarnStatusAction(barnStatusFormSchema.parse(raw))} destructive={active}>
      {() => <><input type="hidden" name="barnId" value={barnId} /><input type="hidden" name="active" value={String(!active)} /></>}
    </ReasonDialog>
  );
}

export function CancelMovementAction({ eventId }: { eventId: string }) {
  return (
    <ReasonDialog title="Batalkan mutasi" detail="Saldo dan laporan pada tanggal mutasi akan dihitung ulang. Riwayat asli tetap tercatat."
      schema={cancelMovementSchema} mutation={cancelMovementAction} destructive>
      {(key) => <><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="requestKey" value={key} /></>}
    </ReasonDialog>
  );
}

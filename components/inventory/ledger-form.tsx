"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DateField } from "@/components/shared/date-field";
import { Check } from "lucide-react";
import { useRowAction } from "@/components/shared/row-actions";
import { FormDialog } from "@/components/shared/form-dialog";
import { ChoiceField, FormError, TextField, type FieldErrors } from "@/components/shared/form-fields";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/auth/actions";

export type Choice = { value: string; label: string };
export type RawForm = Record<string, FormDataEntryValue>;
export type LedgerRenderer = (
  errors: FieldErrors,
  values: RawForm,
  update: (name: string, value: string) => void,
) => ReactNode;

export type LedgerField = {
  name: string;
  label: string;
  value?: string;
  type?: "date";
  inputMode?: "numeric" | "decimal";
  choices?: Choice[];
  max?: string;
  placeholder?: string;
};

export function LedgerFields({ fields, errors, update }: {
  fields: LedgerField[]; errors: FieldErrors; update: (name: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(({ name, label, value, type, choices, max, inputMode, placeholder }) => {
        const error = errors[name];
        if (type === "date") {
          return <DateField key={name} name={name} label={label} defaultValue={value} max={max}
            onValueChange={(date) => update(name, date)} error={error} />;
        }
        if (choices) {
          return <ChoiceField key={name} name={name} label={label} choices={choices} value={value}
            onValueChange={(choice) => update(name, choice ?? "")} error={error} />;
        }
        return <TextField key={name} name={name} label={label} defaultValue={value} inputMode={inputMode} placeholder={placeholder}
          onChange={(event) => update(name, event.currentTarget.value)} error={error} />;
      })}
    </div>
  );
}

export function LedgerForm({
  title, description, schema, action, fields, renderExtra, prepare, confirm, initial = {}, triggerVariant, destructive = false,
}: {
  title: string;
  description: string;
  schema: z.ZodType;
  action: (raw: unknown) => Promise<ActionResult<unknown>>;
  fields: LedgerField[];
  renderExtra?: LedgerRenderer;
  prepare?: (raw: RawForm) => unknown;
  confirm?: string;
  initial?: RawForm;
  destructive?: boolean;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const router = useRouter();
  const rowAction = useRowAction();
  const [localOpen, setLocalOpen] = useState(false);
  const open = rowAction?.open ?? localOpen;
  const [requestKey, setRequestKey] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const lastSubmission = useRef<unknown>(null);

  function update(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function changeOpen(value: boolean) {
    if (pending) return;
    if (rowAction) {
      if (!value) rowAction.close();
      return;
    }
    if (value) {
      setRequestKey(crypto.randomUUID());
      setErrors({});
      setMessage("");
      setValues(initial);
    }
    setLocalOpen(value);
  }

  async function persist() {
    setPending(true);
    setMessage("");
    try {
      const response = await action(lastSubmission.current);
      if (response.ok) {
        setConfirmOpen(false);
        if (rowAction) rowAction.close();
        else setLocalOpen(false);
        toast.success("Pencatatan berhasil disimpan.");
        router.refresh();
      } else {
        setConfirmOpen(false);
        setMessage(response.message);
      }
    } catch {
      setConfirmOpen(false);
      setMessage("Tidak dapat terhubung. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const payload = prepare ? prepare(raw) : raw;
    const validated = schema.safeParse(payload);
    setMessage("");
    if (!validated.success) {
      setErrors(z.flattenError(validated.error, (issue) => issue.message).fieldErrors);
      return;
    }
    setErrors({});
    lastSubmission.current = payload;
    if (confirm) setConfirmOpen(true);
    else void persist();
  }

  return (
    <>
      <FormDialog open={open} onOpenChange={changeOpen} title={title} description={description} triggerVariant={triggerVariant}>
        <form noValidate onSubmit={submit} className="min-w-0 space-y-4">
          <input type="hidden" name="requestKey" value={rowAction?.requestKey ?? requestKey} />
          <LedgerFields fields={fields} errors={errors} update={update} />
          {renderExtra?.(errors, values, update)}
          <FormError message={message} />
          <Button type="submit" className="h-10" disabled={pending}>{pending ? "Menyimpan…" : confirm ? "Periksa dan lanjutkan" : "Simpan pencatatan"}</Button>
        </form>
      </FormDialog>
      {confirm && <AlertDialog open={confirmOpen} onOpenChange={(value) => { if (!pending) setConfirmOpen(value); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Konfirmasi pencatatan</AlertDialogTitle><AlertDialogDescription>{confirm}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
            <Button type="button" variant={destructive ? "destructive" : "default"} onClick={persist} disabled={pending}>
              <Check aria-hidden="true" />{pending ? "Menyimpan…" : "Konfirmasi dan simpan"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </>
  );
}

export const textField = (name: string, label: string, value?: string): LedgerField => ({ name, label, value });
export const selectField = (name: string, label: string, choices: Choice[], value?: string): LedgerField => ({ name, label, choices, value });
export const amountField = (name: string, label: string, value?: string, decimal = false): LedgerField => ({ name, label, value, inputMode: decimal ? "decimal" : "numeric" });
export const dateField = (today: string): LedgerField => ({ name: "businessDate", label: "Tanggal (WIB)", type: "date", value: today, max: today });

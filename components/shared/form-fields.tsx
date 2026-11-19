"use client";

import { useId } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FieldErrors = Partial<Record<string, string[]>>;

export function TextField({
  name, label, error, ...input
}: Omit<React.ComponentProps<typeof Input>, "id" | "name"> & { name: string; label: string; error?: string[] }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} className="h-10" {...input} />
      {error && <FieldError id={errorId}>{error[0]}</FieldError>}
    </Field>
  );
}

export function FormError({ message }: { message: string }) {
  return message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>;
}

export function ChoiceField({
  name, label, choices, value, error, onValueChange,
}: {
  name: string;
  label: string;
  choices: readonly { value: string; label: string }[];
  value?: string;
  onValueChange?: (value: string | null) => void;
  error?: string[];
}) {
  const id = useId();
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <Select name={name} items={choices} defaultValue={value} onValueChange={onValueChange}>
        <SelectTrigger aria-labelledby={id} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} className="h-10 w-full">
          <SelectValue placeholder="Pilih salah satu" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <FieldError id={`${id}-error`}>{error[0]}</FieldError>}
    </Field>
  );
}

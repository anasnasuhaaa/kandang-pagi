"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FieldErrors = Partial<Record<string, string[]>>;

type InputFieldProps = Omit<React.ComponentProps<typeof Input>, "id" | "name"> & {
  name: string;
  label: string;
  error?: string[];
};

export function TextField({
  name, label, error, action, ...input
}: InputFieldProps & { action?: React.ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const control = <Input id={id} name={name} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} className="h-10" {...input} />;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {action ? <div className="relative">{control}{action}</div> : control}
      {error && <FieldError id={errorId}>{error[0]}</FieldError>}
    </Field>
  );
}

export function PasswordField(props: Pick<InputFieldProps, "name" | "label" | "error" | "autoComplete">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      className="h-10 pr-12"
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 right-0.5 my-auto"
          aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          onClick={() => setVisible((value) => !value)}
        >
          <Icon aria-hidden="true" />
        </Button>
      }
    />
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

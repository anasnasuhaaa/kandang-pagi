"use client";

import { id as indonesian } from "date-fns/locale/id";
import { CalendarIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Labels } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { businessDate, businessTimeZone, formatDate, jakartaStart } from "@/lib/format";

const labels: Partial<Labels> = {
  labelNav: () => "Navigasi bulan",
  labelPrevious: () => "Bulan sebelumnya",
  labelNext: () => "Bulan berikutnya",
  labelDayButton: (day, { today, selected }) => {
    const date = formatDate(businessDate(day));
    return `${today ? "Hari ini, " : ""}${date}${selected ? ", dipilih" : ""}`;
  },
};

export function DateField({
  name, label, defaultValue = "", min, max, error, onValueChange,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  error?: string[];
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const form = input.current?.form;
    function reset() {
      setValue(defaultValue);
      setOpen(false);
      onValueChange?.(defaultValue);
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, onValueChange]);

  function select(value: string) {
    setValue(value);
    onValueChange?.(value);
    setOpen(false);
  }

  const selected = value ? jakartaStart(value) : undefined;
  const first = min ? jakartaStart(min) : undefined;
  const last = max ? jakartaStart(max) : undefined;

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>{label}</FieldLabel>
      <input ref={input} type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          aria-labelledby={`${id}-label ${id}-value`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          render={<Button variant="outline" className="h-10 w-full min-w-0 justify-start text-left font-normal" />}
        >
          <CalendarIcon aria-hidden="true" />
          <span id={`${id}-value`} className={value ? "truncate" : "truncate text-muted-foreground"}>
            {value ? formatDate(value) : "Pilih tanggal"}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={`Kalender ${label}`}
          className="max-h-(--available-height) w-fit max-w-[calc(100vw-1rem)] gap-1 overflow-y-auto p-1"
          initialFocus={false}
        >
          <Calendar
            mode="single"
            required
            autoFocus
            timeZone={businessTimeZone}
            locale={indonesian}
            labels={labels}
            className="[--cell-size:--spacing(9)]"
            selected={selected}
            defaultMonth={selected}
            startMonth={first}
            endMonth={last}
            disabled={[...(first ? [{ before: first }] : []), ...(last ? [{ after: last }] : [])]}
            onSelect={(day) => select(businessDate(day))}
          />
          {value && (
            <Button type="button" variant="ghost" onClick={() => select("")}>
              Kosongkan tanggal
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {error && <FieldError id={`${id}-error`}>{error[0]}</FieldError>}
    </Field>
  );
}

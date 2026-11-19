"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { ActionResult } from "@/server/auth/actions";
import type { FieldErrors } from "./form-fields";

export function useAccountForm<T>(schema: z.ZodType<T>, action: (input: T) => Promise<ActionResult<unknown>>, onSuccess: (value: unknown) => void) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    setMessage("");
    if (!result.success) {
      setErrors(z.flattenError(result.error).fieldErrors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await action(result.data);
      if (response.ok) onSuccess(response.value);
      else setMessage(response.message);
    } catch {
      const feedback = "Tidak dapat terhubung. Coba lagi.";
      toast.error(feedback);
      setMessage(feedback);
    } finally {
      setPending(false);
    }
  }

  return { errors, message, pending, submit };
}

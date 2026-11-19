"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/server/auth/actions";
import { safeError } from "@/server/services/errors";
import { addMovement, cancelMovement, createBarn, createFlock, setBarnStatus } from "@/server/services/population";

async function run<T>(mutation: (context: Headers, raw: unknown) => Promise<T>, raw: unknown): Promise<ActionResult<T>> {
  try {
    const value = await mutation(await headers(), raw);
    revalidatePath("/populasi");
    revalidatePath("/dashboard");
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function createBarnAction(raw: unknown) { return run(createBarn, raw); }
export async function setBarnStatusAction(raw: unknown) { return run(setBarnStatus, raw); }
export async function createFlockAction(raw: unknown) { return run(createFlock, raw); }
export async function addMovementAction(raw: unknown) { return run(addMovement, raw); }
export async function cancelMovementAction(raw: unknown) { return run(cancelMovement, raw); }

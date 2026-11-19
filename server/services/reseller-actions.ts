"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "../auth/actions";
import { safeError } from "./errors";
import { adjustResellerStock, cancelResellerEvent, defineResellerUnit, openResellerCash, postResellerCash, postResellerStock } from "./reseller";

async function run<T>(service: (context: Headers, raw: unknown) => Promise<T>, raw: unknown): Promise<ActionResult<T>> {
  try {
    const value = await service(await headers(), raw);
    revalidatePath("/reseller");
    revalidatePath("/laporan");
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function defineUnitAction(raw: unknown) { return run(defineResellerUnit, raw); }
export async function intakeAction(raw: unknown) { return run((context, input) => postResellerStock(context, input, "intake"), raw); }
export async function resellerSaleAction(raw: unknown) { return run((context, input) => postResellerStock(context, input, "sale"), raw); }
export async function adjustStockAction(raw: unknown) { return run(adjustResellerStock, raw); }
export async function openResellerCashAction(raw: unknown) { return run(openResellerCash, raw); }
export async function postResellerCashAction(raw: unknown) { return run(postResellerCash, raw); }
export async function cancelResellerAction(raw: unknown) { return run(cancelResellerEvent, raw); }

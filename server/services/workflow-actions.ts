"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "../auth/actions";
import { directCorrection, requestCorrection, reviewCorrection } from "./corrections";
import { safeError } from "./errors";
import { openCash, postCash } from "./finance";
import { changeHealthStatus, createIncident, endQuarantine, executeVaccination, scheduleVaccination, startQuarantine } from "./health";
import { reconcileReceipts } from "./receipts";

async function run<T>(service: (context: Headers, input: unknown) => Promise<T>, input: unknown, paths: string[]): Promise<ActionResult<T>> {
  try {
    const value = await service(await headers(), input);
    for (const path of paths) revalidatePath(path);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

const health = ["/kesehatan", "/dashboard"];
const finance = ["/keuangan", "/dashboard"];
const correction = ["/pengaturan", "/keuangan", "/populasi", "/pakan", "/produksi-telur", "/dashboard"];

export async function addIncidentAction(input: unknown) { return run(createIncident, input, health); }
export async function changeHealthStatusAction(input: unknown) { return run(changeHealthStatus, input, health); }
export async function addVaccinationAction(input: unknown) { return run(scheduleVaccination, input, health); }
export async function executeVaccinationAction(input: unknown) { return run(executeVaccination, input, health); }
export async function startQuarantineAction(input: unknown) { return run(startQuarantine, input, health); }
export async function endQuarantineAction(input: unknown) { return run(endQuarantine, input, health); }
export async function openCashAction(input: unknown) { return run(openCash, input, finance); }
export async function postCashAction(input: unknown) { return run(postCash, input, finance); }
export async function requestCorrectionAction(input: unknown) { return run(requestCorrection, input, correction); }
export async function reviewCorrectionAction(input: unknown) { return run(reviewCorrection, input, correction); }
export async function directCorrectionAction(input: unknown) { return run(directCorrection, input, correction); }

export async function reconcileReceiptsAction(): Promise<ActionResult<{ cleared: number; inspected: number }>> {
  return run((context) => reconcileReceipts(context), null, finance);
}

"use server";

import { headers } from "next/headers";
import {
  changeOwnPassword, completeAccountLink, createAccount, issueAccountLink, saveOwnTheme, saveProfile,
  setAccountRole, setAccountStatus,
} from "./accounts";
import { safeError } from "../services/errors";

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; message: string };

async function run<T>(service: (context: Headers, input: unknown) => Promise<T>, input: unknown): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await service(await headers(), input) };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function createUserAction(input: unknown) { return run(createAccount, input); }
export async function issueLinkAction(input: unknown) { return run(issueAccountLink, input); }
export async function completeLinkAction(input: unknown) { return run(completeAccountLink, input); }
export async function setRoleAction(input: unknown) { return run(setAccountRole, input); }
export async function setStatusAction(input: unknown) { return run(setAccountStatus, input); }
export async function saveProfileAction(input: unknown) { return run(saveProfile, input); }
export async function changePasswordAction(input: unknown) { return run(changeOwnPassword, input); }
export async function saveThemeAction(input: unknown) { return run(saveOwnTheme, input); }

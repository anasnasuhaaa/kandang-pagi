"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "../auth/actions";
import { safeError } from "./errors";
import { adjustEggs, gradeEggs, harvestEggs, sellEggs } from "./eggs";
import { adjustFeed, buyFeed, closeBarnFeed, createFeedProduct, issueFeed, mixFeed, openFeedStock } from "./feed";

async function apply<T>(run: (context: Headers, raw: unknown) => Promise<T>, input: unknown): Promise<ActionResult<T>> {
  try {
    const value = await run(await headers(), input);
    for (const path of ["/pakan", "/produksi-telur", "/dashboard"]) revalidatePath(path);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: safeError(error) };
  }
}

export async function createProductAction(input: unknown) { return apply(createFeedProduct, input); }
export async function openFeedAction(input: unknown) { return apply(openFeedStock, input); }
export async function buyFeedAction(input: unknown) { return apply(buyFeed, input); }
export async function issueFeedAction(input: unknown) { return apply(issueFeed, input); }
export async function mixFeedAction(input: unknown) { return apply(mixFeed, input); }
export async function closeFeedAction(input: unknown) { return apply(closeBarnFeed, input); }
export async function adjustFeedAction(input: unknown) { return apply(adjustFeed, input); }
export async function harvestEggsAction(input: unknown) { return apply(harvestEggs, input); }
export async function gradeEggsAction(input: unknown) { return apply(gradeEggs, input); }
export async function sellEggsAction(input: unknown) { return apply(sellEggs, input); }
export async function adjustEggsAction(input: unknown) { return apply(adjustEggs, input); }

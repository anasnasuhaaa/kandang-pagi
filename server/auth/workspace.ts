import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canViewModule, modules, type ModuleSlug } from "../../lib/navigation";
import { getActor } from "./permissions";

export async function workspaceActor() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/masuk");
  return actor;
}

export async function requireModule(slug: ModuleSlug) {
  const actor = await workspaceActor();
  const item = modules.find((item) => item.slug === slug);
  if (!item || !canViewModule(actor.role, item)) redirect(actor.role === "reseller" ? "/reseller" : "/dashboard");
  return actor;
}

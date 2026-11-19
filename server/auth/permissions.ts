import { eq } from "drizzle-orm";
import { database, type Database, type Transaction } from "../../db";
import { resellerSpaces, user } from "../../db/schema";
import type { Role } from "../../lib/roles";
import { ServiceError } from "../services/errors";
import { auth, createAuth } from "./config";

type Store = Database | Transaction;

export async function getActor(headers: Headers, store?: Store) {
  const current = await (store ? createAuth(store) : auth()).api.getSession({
    headers, query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!current) return null;
  const [actor] = await (store ?? database()).select({
    id: user.id, name: user.name, email: user.email, role: user.role,
    status: user.status, theme: user.theme,
  }).from(user).where(eq(user.id, current.user.id));
  return actor?.status === "active" ? actor : null;
}

export type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>;

export async function requireAuth(headers: Headers, store?: Store) {
  const actor = await getActor(headers, store);
  if (!actor) throw new ServiceError("unauthenticated", "Masuk untuk melanjutkan.");
  return actor;
}

export async function requireRole(headers: Headers, allowed: readonly Role[], store?: Store) {
  const actor = await requireAuth(headers, store);
  if (!allowed.includes(actor.role)) throw new ServiceError("forbidden", "Anda tidak memiliki akses ke bagian ini.");
  return actor;
}

export async function requireResellerSpace(headers: Headers, store?: Store) {
  const actor = await requireRole(headers, ["reseller"], store);
  const [space] = await (store ?? database()).select({ id: resellerSpaces.id }).from(resellerSpaces)
    .where(eq(resellerSpaces.userId, actor.id));
  if (!space) throw new ServiceError("forbidden", "Ruang kerja reseller belum tersedia.");
  return { actor, spaceId: space.id };
}

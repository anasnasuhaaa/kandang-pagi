import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { database, type Database, type Transaction } from "../../db";
import { accountLinks, auditEvents, linkAttempts, resellerSpaces, session, user, type tokenPurposes } from "../../db/schema";
import {
  changePasswordSchema, changeRoleSchema, changeStatusSchema, completeLinkSchema,
  issueLinkSchema, newAccountSchema, profileSchema, themeSchema,
} from "../../lib/account-validation";
import { accountAuditLabels } from "../../lib/account-audit-labels";
import type { TableSort } from "../../lib/domain/table-sort";
import { accountPresentation } from "../../lib/status-presentation";
import { labelOrder, tableOrder, textOrder } from "../services/table-order";
import { roleLabels, type Role } from "../../lib/roles";
import { ServiceError } from "../services/errors";
import { lockScope, writeAudit } from "../services/transactions";
import { authConfig, authIpHeader, createAuth } from "./config";
import { requireAuth, requireRole, type Actor } from "./permissions";

type Purpose = (typeof tokenPurposes)[number];
type Account = typeof user.$inferSelect;
const linkLifetime = { activation: 86_400_000, reset: 1_800_000 } satisfies Record<Purpose, number>;
const invalidLink = "Tautan tidak valid, kedaluwarsa, atau sudah digunakan.";

function readInput<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("invalid", result.error.issues[0].message);
  return result.data;
}

function digestFor(purpose: Purpose, token: string) {
  return createHash("sha256").update(`${purpose}:${token}`).digest("hex");
}

function requiredStatus(purpose: Purpose) {
  return purpose === "activation" ? "pending" : "active";
}

async function withAdmin<T>(headers: Headers, db: Database, operation: (tx: Transaction, actor: Actor) => Promise<T>) {
  return db.transaction(async (tx) => {
    await lockScope(tx, "accounts");
    return operation(tx, await requireRole(headers, ["administrator"], tx));
  });
}

async function ensureResellerSpace(tx: Transaction, userId: string, role: Role) {
  if (role === "reseller") await tx.insert(resellerSpaces).values({ userId }).onConflictDoNothing();
}

async function revokeLinks(tx: Transaction, userId: string, purpose?: Purpose) {
  await tx.update(accountLinks).set({ revokedAt: new Date() }).where(and(
    eq(accountLinks.userId, userId), isNull(accountLinks.usedAt), isNull(accountLinks.revokedAt),
    purpose ? eq(accountLinks.purpose, purpose) : undefined,
  ));
}

async function issue(tx: Transaction, actor: Actor, target: Pick<Account, "id" | "email" | "status">, purpose: Purpose) {
  if (target.status !== requiredStatus(purpose)) {
    throw new ServiceError("conflict", "Status akun tidak sesuai untuk penerbitan tautan ini.");
  }
  await revokeLinks(tx, target.id, purpose);

  // Better Auth generates its cryptographic token and hashes its verification identifier.
  let token: string | undefined;
  await createAuth(tx, (value) => { token = value; }).api.requestPasswordReset({ body: { email: target.email } });
  if (!token) throw new Error("Better Auth tidak menghasilkan token.");

  const expiresAt = new Date(Date.now() + linkLifetime[purpose]);
  const [link] = await tx.insert(accountLinks).values({
    userId: target.id, purpose, digest: digestFor(purpose, token), createdBy: actor.id, expiresAt,
  }).returning({ id: accountLinks.id });
  await writeAudit(tx, {
    actorId: actor.id, actorRole: actor.role, action: `${purpose}_issued`, entity: "account",
    entityId: target.id, correlationId: link.id,
  });
  const url = new URL("/akses", authConfig().baseURL);
  url.hash = new URLSearchParams({ tujuan: purpose, token }).toString();
  return { url: url.toString(), expiresAt: expiresAt.toISOString() };
}

async function accountById(tx: Transaction, id: string) {
  const [account] = await tx.select().from(user).where(eq(user.id, id));
  if (!account) throw new ServiceError("not-found", "Akun tidak ditemukan.");
  return account;
}

export async function createAccount(headers: Headers, input: unknown, db = database()) {
  const payload = readInput(newAccountSchema, input);
  return withAdmin(headers, db, async (tx, actor) => {
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, payload.email));
    if (existing) throw new ServiceError("conflict", "Alamat email sudah terdaftar.");
    const { user: created } = await createAuth(tx).api.createUser({
      headers, body: { ...payload, data: { status: "pending" } },
    });
    await ensureResellerSpace(tx, created.id, payload.role);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "account_created", entity: "account",
      entityId: created.id, after: { role: payload.role, status: "pending" },
    });
    return issue(tx, actor, { id: created.id, email: created.email, status: "pending" }, "activation");
  });
}

export async function issueAccountLink(headers: Headers, raw: unknown, db = database()) {
  const payload = readInput(issueLinkSchema, raw);
  return withAdmin(headers, db, async (tx, actor) => issue(tx, actor, await accountById(tx, payload.userId), payload.purpose));
}

export async function setAccountRole(headers: Headers, raw: unknown, db = database()) {
  const payload = readInput(changeRoleSchema, raw);
  return withAdmin(headers, db, async (tx, actor) => {
    if (actor.id === payload.userId) throw new ServiceError("forbidden", "Anda tidak dapat mengubah peran akun sendiri.");
    const target = await accountById(tx, payload.userId);
    if (target.role === payload.role) return;
    await tx.update(user).set({ role: payload.role, updatedAt: new Date() }).where(eq(user.id, target.id));
    await ensureResellerSpace(tx, target.id, payload.role);
    await tx.delete(session).where(eq(session.userId, target.id));
    await revokeLinks(tx, target.id);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "role_changed", entity: "account",
      entityId: target.id, before: { role: target.role }, after: { role: payload.role },
    });
  });
}

export async function setAccountStatus(headers: Headers, raw: unknown, db = database()) {
  const payload = readInput(changeStatusSchema, raw);
  return withAdmin(headers, db, async (tx, actor) => {
    if (actor.id === payload.userId) throw new ServiceError("forbidden", "Anda tidak dapat menangguhkan akun sendiri.");
    const target = await accountById(tx, payload.userId);
    if (target.status === "pending") throw new ServiceError("conflict", "Akun harus menyelesaikan aktivasi terlebih dahulu.");
    if (target.status === payload.status) return;
    await tx.update(user).set({ status: payload.status, banned: payload.status === "suspended", updatedAt: new Date() }).where(eq(user.id, target.id));
    await tx.delete(session).where(eq(session.userId, target.id));
    await revokeLinks(tx, target.id);
    await writeAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "status_changed", entity: "account",
      entityId: target.id, before: { status: target.status }, after: { status: payload.status },
    });
  });
}

async function countLinkAttempt(db: Database, headers: Headers) {
  const ip = process.env.VERCEL === "1" ? headers.get(authIpHeader) : null;
  const subject = createHmac("sha256", authConfig().secret).update(ip ?? "no-trusted-ip").digest("hex");
  const expiry = sql`${linkAttempts.windowStartedAt} <= now() - interval '5 minutes'`;
  const [attempt] = await db.insert(linkAttempts).values({ subject, attempts: 1, windowStartedAt: new Date() })
    .onConflictDoUpdate({
      target: linkAttempts.subject,
      set: {
        attempts: sql<number>`case when ${expiry} then 1 else least(${linkAttempts.attempts} + 1, 25) end`,
        windowStartedAt: sql<Date>`case when ${expiry} then now() else ${linkAttempts.windowStartedAt} end`,
      },
    }).returning({ count: linkAttempts.attempts });
  if (attempt.count > 24) throw new ServiceError("rate-limit", "Terlalu banyak percobaan. Tunggu beberapa menit.");
}

export async function completeAccountLink(headers: Headers, raw: unknown, db = database()) {
  await countLinkAttempt(db, headers);
  const payload = readInput(completeLinkSchema, raw);
  const digest = digestFor(payload.purpose, payload.token);
  return db.transaction(async (tx) => {
    await lockScope(tx, "accounts");
    const [link] = await tx.select().from(accountLinks).where(and(eq(accountLinks.purpose, payload.purpose), eq(accountLinks.digest, digest)));
    if (!link || link.usedAt || link.revokedAt || link.expiresAt <= new Date()
        || !timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(link.digest, "hex"))) {
      throw new ServiceError("invalid", invalidLink);
    }
    const target = await accountById(tx, link.userId);
    if (target.status !== requiredStatus(payload.purpose)) throw new ServiceError("invalid", invalidLink);

    await createAuth(tx).api.resetPassword({ body: { token: payload.token, newPassword: payload.password } });
    if (payload.purpose === "activation") {
      await tx.update(user).set({ status: "active", emailVerified: true, updatedAt: new Date() }).where(eq(user.id, target.id));
    }
    await tx.update(accountLinks).set({ usedAt: new Date() }).where(eq(accountLinks.id, link.id));
    await writeAudit(tx, {
      actorId: target.id, actorRole: target.role, action: `${payload.purpose}_completed`,
      entity: "account", entityId: target.id, correlationId: link.id,
    });
  });
}

async function updateProfile(headers: Headers, values: Partial<Pick<Account, "name" | "theme">>, db: Database) {
  return db.transaction(async (tx) => {
    await lockScope(tx, "accounts");
    const actor = await requireAuth(headers, tx);
    await tx.update(user).set({ ...values, updatedAt: new Date() }).where(eq(user.id, actor.id));
    await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "profile_updated", entity: "account", entityId: actor.id });
  });
}

export async function saveProfile(headers: Headers, raw: unknown, db = database()) {
  return updateProfile(headers, readInput(profileSchema, raw), db);
}

export async function saveOwnTheme(headers: Headers, raw: unknown, db = database()) {
  return updateProfile(headers, { theme: readInput(themeSchema, raw) }, db);
}

export async function changeOwnPassword(headers: Headers, raw: unknown, db = database()) {
  const values = readInput(changePasswordSchema, raw);
  return db.transaction(async (tx) => {
    await lockScope(tx, "accounts");
    const actor = await requireAuth(headers, tx);
    try {
      await createAuth(tx).api.changePassword({
        headers, body: { currentPassword: values.current, newPassword: values.password, revokeOtherSessions: true },
      });
    } catch (error) {
      if (error && typeof error === "object" && "body" in error && error.body &&
          typeof error.body === "object" && "code" in error.body && error.body.code === "INVALID_PASSWORD") {
        throw new ServiceError("invalid", "Kata sandi saat ini salah.");
      }
      throw error;
    }
    // Require fresh login so the cookie lifecycle stays in one place.
    await tx.delete(session).where(eq(session.userId, actor.id));
    await revokeLinks(tx, actor.id);
    await writeAudit(tx, { actorId: actor.id, actorRole: actor.role, action: "password_changed", entity: "account", entityId: actor.id });
  });
}

export async function listAccounts(headers: Headers, search: string, page: number, db = database(), sort?: TableSort) {
  await requireRole(headers, ["administrator"], db);
  const needle = search.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const where = needle ? or(ilike(user.name, `%${needle}%`), ilike(user.email, `%${needle}%`)) : undefined;
  const perPage = 12;
  const [totals] = await db.select({ count: count() }).from(user).where(where);
  const pages = Math.max(1, Math.ceil(totals.count / perPage));
  const current = Math.max(1, Math.min(page, pages));
  const order = await tableOrder(db, sort, {
    name: textOrder(user.name), email: textOrder(user.email), role: labelOrder(user.role, roleLabels),
    status: labelOrder(user.status, Object.fromEntries(Object.entries(accountPresentation).map(([key, value]) => [key, value.label]))),
  });
  const rows = await db.select({
    id: user.id, name: user.name, email: user.email, role: user.role, status: user.status,
  }).from(user).where(where).orderBy(...order, desc(user.createdAt), user.id).limit(perPage).offset((current - 1) * perPage);
  return { rows, pages, current, total: totals.count, pageSize: perPage };
}

export async function listAccountAudit(headers: Headers, page: number, db = database(), sort?: TableSort) {
  await requireRole(headers, ["administrator"], db);
  const limit = 15;
  const where = and(eq(auditEvents.entity, "account"), isNull(auditEvents.spaceId));
  const [totals] = await db.select({ count: count() }).from(auditEvents).where(where);
  const pages = Math.max(1, Math.ceil(totals.count / limit));
  const current = Math.max(1, Math.min(page, pages));
  const order = await tableOrder(db, sort, {
    recorded: { expression: auditEvents.recordedAt }, actor: textOrder(user.name),
    role: labelOrder(auditEvents.actorRole, roleLabels), event: labelOrder(auditEvents.action, accountAuditLabels),
  });
  const rows = await db.select({
    id: auditEvents.id, action: auditEvents.action, actorName: user.name,
    actorRole: auditEvents.actorRole, at: auditEvents.recordedAt,
  }).from(auditEvents).innerJoin(user, eq(user.id, auditEvents.actorId)).where(where)
    .orderBy(...order, desc(auditEvents.recordedAt), desc(auditEvents.id)).limit(limit).offset((current - 1) * limit);
  return { rows, pages, current, total: totals.count, pageSize: limit };
}

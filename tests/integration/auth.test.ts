import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { connectDatabase } from "../../db";
import { accountLinks, adminBootstrap, auditEvents, user, verification } from "../../db/schema";
import {
  changeOwnPassword, completeAccountLink, createAccount, issueAccountLink, listAccountAudit,
  listAccounts, saveProfile, setAccountRole, setAccountStatus,
} from "../../server/auth/accounts";
import { bootstrapAdmin } from "../../server/auth/bootstrap";
import { authConfig, createAuth } from "../../server/auth/config";
import { getActor, requireResellerSpace } from "../../server/auth/permissions";
import { recordOnce } from "../../server/services/transactions";
import { testDatabaseUrl } from "./test-database";

const password = () => randomBytes(18).toString("base64url");
const email = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;
const newPassword = (value: string) => ({ password: value, confirmation: value });

function fragment(link: string, value: string) {
  const url = new URL(link);
  const params = new URLSearchParams(url.hash.slice(1));
  return { purpose: params.get("tujuan"), token: params.get("token"), ...newPassword(value) };
}

test("PostgreSQL account lifecycle and access boundaries", async (t) => {
  const { client, db } = connectDatabase(testDatabaseUrl());
  t.after(() => client.end());
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const [count] = await db.select().from(adminBootstrap);
  assert.ok(!count, "Use a fresh isolated test database.");

  const auth = createAuth(db);
  const adminEmail = email("admin");
  const adminPassword = password().slice(0, 8);

  async function login(address: string, secret: string) {
    const response = await auth.handler(new Request(new URL("/api/auth/sign-in/email", authConfig().baseURL), {
      method: "POST",
      headers: { "content-type": "application/json", origin: authConfig().baseURL },
      body: JSON.stringify({ email: address, password: secret }),
    }));
    if (!response.ok) return { status: response.status, headers: new Headers() };
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie.includes("session_token"));
    return { status: response.status, headers: new Headers({ cookie }) };
  }

  await t.test("migrates all tables and creates exactly one first administrator under concurrency", async () => {
    await assert.rejects(bootstrapAdmin(db, { email: adminEmail, name: "Administrator uji", password: adminPassword.slice(1) }), /minimal 8 karakter/);
    const outcome = await Promise.allSettled([
      bootstrapAdmin(db, { email: adminEmail, name: "Administrator uji", password: adminPassword }),
      bootstrapAdmin(db, { email: adminEmail, name: "Administrator uji", password: adminPassword }),
    ]);
    assert.equal(outcome.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal((await db.select().from(adminBootstrap)).length, 1);
    await assert.rejects(bootstrapAdmin(db, { email: email("extra"), name: "Administrator lain", password: password() }), /sudah dibuat/);
    assert.equal((await db.execute(sql`select count(*)::int as total from pg_tables where schemaname = 'public'`))[0].total, 37);
  });

  let adminHeaders: Headers;
  await t.test("sign-in starts an authoritative session, public sign-up is disabled", async () => {
    const signedIn = await login(adminEmail, adminPassword);
    assert.equal(signedIn.status, 200);
    adminHeaders = signedIn.headers;
    assert.equal((await getActor(adminHeaders, db))?.role, "administrator");
    const response = await auth.handler(new Request(new URL("/api/auth/sign-up/email", authConfig().baseURL), {
      method: "POST",
      headers: { "content-type": "application/json", origin: authConfig().baseURL },
      body: JSON.stringify({ email: email("public"), name: "Public", password: password() }),
    }));
    assert.equal(response.status, 404);
    await assert.rejects(listAccounts(new Headers(), "", 1, db), /Masuk untuk melanjutkan/);
  });

  const operatorEmail = email("abk");
  const operatorPassword = password().slice(0, 8);
  let operatorHeaders: Headers;
  let operatorId: string;

  await t.test("pending account, token secrecy, purpose binding, single use and role enforcement", async () => {
    const issued = await createAccount(adminHeaders, { name: "Operator", email: operatorEmail, role: "abk" }, db);
    assert.equal(new URL(issued.url).pathname, "/akses");
    const payload = fragment(issued.url, operatorPassword);
    assert.ok(payload.token);
    assert.ok((await login(operatorEmail, operatorPassword)).status >= 400);
    const rows = await db.select().from(accountLinks);
    const values = await db.select().from(verification);
    const audit = await db.select().from(auditEvents);
    assert.equal(rows.length, 1);
    assert.equal(values.length, 1);
    assert.ok(values[0].identifier.length >= 43);
    assert.ok(!JSON.stringify([rows, values, audit]).includes(payload.token), "Raw token persisted");
    await assert.rejects(completeAccountLink(new Headers(), fragment(issued.url, operatorPassword.slice(1)), db), /minimal 8 karakter/);
    await assert.rejects(completeAccountLink(new Headers(), { ...payload, purpose: "reset" }, db), /tidak valid/);
    const results = await Promise.allSettled([
      completeAccountLink(new Headers(), payload, db), completeAccountLink(new Headers(), payload, db),
    ]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    await assert.rejects(completeAccountLink(new Headers(), payload, db), /sudah digunakan/);
    const signedIn = await login(operatorEmail, operatorPassword);
    assert.equal(signedIn.status, 200);
    operatorHeaders = signedIn.headers;
    const actor = await getActor(operatorHeaders, db);
    assert.equal(actor?.role, "abk");
    operatorId = actor!.id;
    await assert.rejects(listAccountAudit(operatorHeaders, 1, db), /tidak memiliki akses/);
    await assert.rejects(createAccount(operatorHeaders, { name: "Terlarang", email: email("denied"), role: "administrator" }, db), /tidak memiliki akses/);
    await assert.rejects(setAccountRole(operatorHeaders, { userId: operatorId, role: "administrator" }, db), /tidak memiliki akses/);
  });

  let latestPassword: string;
  await t.test("regenerating an account link revokes older links, expiry and reset revoke sessions", async () => {
    const first = await issueAccountLink(adminHeaders, { userId: operatorId, purpose: "reset" }, db);
    const second = await issueAccountLink(adminHeaders, { userId: operatorId, purpose: "reset" }, db);
    latestPassword = password().slice(0, 8);
    await assert.rejects(completeAccountLink(new Headers(), fragment(first.url, latestPassword), db), /tidak valid/);
    const now = Date.now();
    await db.update(accountLinks).set({ createdAt: new Date(now - 3_600_000), expiresAt: new Date(now - 1_000) })
      .where(eq(accountLinks.userId, operatorId));
    await assert.rejects(completeAccountLink(new Headers(), fragment(second.url, latestPassword), db), /kedaluwarsa/);
    const third = await issueAccountLink(adminHeaders, { userId: operatorId, purpose: "reset" }, db);
    const shortReset = fragment(third.url, latestPassword.slice(1));
    await assert.rejects(completeAccountLink(new Headers(), shortReset, db), /minimal 8 karakter/);
    await assert.rejects(auth.api.resetPassword({ body: { token: shortReset.token!, newPassword: shortReset.password } }), /too short/i);
    await completeAccountLink(new Headers(), fragment(third.url, latestPassword), db);
    assert.equal(await getActor(operatorHeaders, db), null);
    assert.equal((await login(operatorEmail, operatorPassword)).status, 401);
    operatorHeaders = (await login(operatorEmail, latestPassword)).headers;
    assert.ok(await getActor(operatorHeaders, db));
  });

  await t.test("profile and self-password change persist; role and suspension revoke sessions", async () => {
    await saveProfile(operatorHeaders, { name: "Operator sore", theme: "dark" }, db);
    const profile = await getActor(operatorHeaders, db);
    assert.equal(profile?.name, "Operator sore");
    assert.equal(profile?.theme, "dark");
    const changed = password().slice(0, 8);
    await assert.rejects(changeOwnPassword(operatorHeaders, { current: latestPassword, ...newPassword(changed.slice(1)) }, db), /minimal 8 karakter/);
    await assert.rejects(auth.api.changePassword({
      headers: operatorHeaders, body: { currentPassword: latestPassword, newPassword: changed.slice(1) },
    }), /too short/i);
    await assert.rejects(changeOwnPassword(operatorHeaders, { current: password(), ...newPassword(changed) }, db), /salah/);
    await changeOwnPassword(operatorHeaders, { current: latestPassword, ...newPassword(changed) }, db);
    assert.equal(await getActor(operatorHeaders, db), null);
    operatorHeaders = (await login(operatorEmail, changed)).headers;
    await setAccountRole(adminHeaders, { userId: operatorId, role: "pemilik" }, db);
    assert.equal(await getActor(operatorHeaders, db), null);
    operatorHeaders = (await login(operatorEmail, changed)).headers;
    assert.equal((await getActor(operatorHeaders, db))?.role, "pemilik");
    await setAccountStatus(adminHeaders, { userId: operatorId, status: "suspended" }, db);
    assert.equal(await getActor(operatorHeaders, db), null);
    assert.ok((await login(operatorEmail, changed)).status >= 400);
    await setAccountStatus(adminHeaders, { userId: operatorId, status: "active" }, db);
    assert.ok((await login(operatorEmail, changed)).status < 400);
  });

  await t.test("reseller workspaces are resolved from session ownership", async () => {
    const spaces = [];
    for (const name of ["Reseller A", "Reseller B"]) {
      const address = email("reseller");
      const secret = password();
      const link = await createAccount(adminHeaders, { name, email: address, role: "reseller" }, db);
      await completeAccountLink(new Headers(), fragment(link.url, secret), db);
      const { headers } = await login(address, secret);
      const space = await requireResellerSpace(headers, db);
      assert.equal(space.actor.role, "reseller");
      spaces.push(space.spaceId);
      await assert.rejects(listAccounts(headers, "", 1, db), /tidak memiliki akses/);
    }
    assert.notEqual(spaces[0], spaces[1]);
    await assert.rejects(requireResellerSpace(adminHeaders, db), /tidak memiliki akses/);
  });

  await t.test("idempotency admits one result and rejects conflicting payload", async () => {
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail));
    const key = { actorId: target.id, command: "integration", requestKey: randomUUID() };
    let count = 0;
    const write = (n: number) => db.transaction((tx) => recordOnce(tx, key, { n }, async () => String(++count)));
    const result = await Promise.all([write(1), write(1)]);
    assert.equal(count, 1);
    assert.equal(result.filter(({ replay }) => !replay).length, 1);
    await assert.rejects(write(2), /data berbeda/);
  });

  await t.test("account and audit sorting use scoped SQL order before pagination", async () => {
    const names = Array.from({ length: 15 }, (_, index) => `Urutan Akun ${String.fromCharCode(65 + index)}`);
    await db.insert(user).values(names.toReversed().map((name) => ({ id: randomUUID(), name, email: email("sort") })));
    const order = { column: "name", direction: "asc" } as const;
    const first = await listAccounts(adminHeaders, "Urutan Akun", 1, db, order);
    const last = await listAccounts(adminHeaders, "Urutan Akun", 999, db, order);
    assert.equal(first.total, 15);
    assert.equal(last.current, 2);
    assert.deepEqual([...first.rows, ...last.rows].map(({ name }) => name), names);
    const defaultPage = await listAccounts(adminHeaders, "Urutan Akun", 1, db);
    const unsupported = await listAccounts(adminHeaders, "Urutan Akun", 1, db, { column: "actions", direction: "asc" });
    assert.deepEqual(unsupported.rows, defaultPage.rows);
    const audit = await listAccountAudit(adminHeaders, 1, db, { column: "event", direction: "asc" });
    assert.ok(audit.total > 0);
    assert.equal(new Set(audit.rows.map(({ id }) => id)).size, audit.rows.length);
  });
});

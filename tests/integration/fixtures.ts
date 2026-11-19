import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../db";
import type { Role } from "../../lib/roles";
import { createAuth } from "../../server/auth/config";

export async function fixtureActor(db: Database, role: Role) {
  const auth = createAuth(db);
  const email = `fixture-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const { user } = await auth.api.createUser({ body: {
    name: `Uji ${role}`, email, password, role, data: { status: "active" },
  } });
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  return { id: user.id, headers: new Headers({ cookie }) };
}

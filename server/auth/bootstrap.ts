import { and, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { adminBootstrap, user } from "../../db/schema";
import { bootstrapSchema } from "../../lib/account-validation";
import { ServiceError } from "../services/errors";
import { lockScope, writeAudit } from "../services/transactions";
import { createAuth } from "./config";

export async function bootstrapAdmin(db: Database, input: unknown) {
  const parsed = bootstrapSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("invalid", parsed.error.issues[0].message);

  return db.transaction(async (tx) => {
    await lockScope(tx, "accounts");
    const [previous] = await tx.select({ userId: adminBootstrap.userId }).from(adminBootstrap).limit(1);
    const [existing] = await tx.select({ id: user.id }).from(user)
      .where(and(eq(user.role, "administrator"), eq(user.status, "active"))).limit(1);
    if (previous || existing) throw new ServiceError("conflict", "Administrator pertama sudah dibuat.");

    const { user: created } = await createAuth(tx).api.createUser({
      body: { ...parsed.data, role: "administrator", data: { status: "active", emailVerified: true } },
    });
    await tx.insert(adminBootstrap).values({ userId: created.id });
    await writeAudit(tx, { actorId: created.id, actorRole: "administrator", entity: "account", entityId: created.id, action: "bootstrap" });
    return created.id;
  });
}

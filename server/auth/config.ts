import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { eq } from "drizzle-orm";
import { database, type Database, type Transaction } from "../../db";
import * as schema from "../../db/schema/auth";
import { passwordPolicy } from "../../lib/validation";

export function authConfig() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const configured = process.env.BETTER_AUTH_URL;
  if (!configured || !secret || secret.length < 32) throw new Error("Konfigurasi Better Auth belum lengkap.");
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["https:", ...(local ? ["http:"] : [])].includes(url.protocol)
      || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("BETTER_AUTH_URL harus berisi asal aplikasi yang valid.");
  }
  return { baseURL: url.origin, secret, secure: url.protocol === "https:" };
}

export const authIpHeader = "x-vercel-forwarded-for";

export function createAuth(store: Database | Transaction, deliver?: (token: string) => void) {
  const { baseURL, secret, secure } = authConfig();
  return betterAuth({
    appName: "Kandang Pagi",
    baseURL,
    secret,
    database: drizzleAdapter(store, { provider: "pg", schema }),
    disabledPaths: ["/sign-up/email"],
    telemetry: { enabled: false },
    logger: { disabled: true },
    advanced: { useSecureCookies: secure, ipAddress: { ipAddressHeaders: [authIpHeader] } },
    user: {
      additionalFields: {
        status: { type: "string", defaultValue: "pending", input: false, required: true },
        theme: { type: "string", defaultValue: "system", input: false, required: true },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (row) => {
            const [account] = await store.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.id, row.userId));
            if (account?.status !== "active") {
              throw new APIError("FORBIDDEN", { message: "Akun belum aktif. Hubungi Administrator." });
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      ...passwordPolicy,
      resetPasswordTokenExpiresIn: 24 * 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ token }) => {
        if (!deliver) throw new Error("Penerbitan tautan hanya tersedia melalui layanan akun.");
        deliver(token);
      },
    },
    verification: { storeIdentifier: "hashed" },
    rateLimit: { enabled: true, storage: "database", customRules: { "/sign-in/email": { window: 60, max: 12 } } },
    session: { cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 7 },
    plugins: [admin({
      defaultRole: "abk",
      adminRoles: ["administrator"],
      roles: { administrator: adminAc, abk: userAc, pemilik: userAc, reseller: userAc },
    })],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  instance ??= createAuth(database());
  return instance;
}

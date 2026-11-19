import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/db";
import { accountIdSchema, loginSchema, roleSchema, themeSchema } from "@/lib/account-validation";
import { authIpHeader, createAuth } from "@/server/auth/config";
import { getActor } from "@/server/auth/permissions";
import { lockScope, writeAudit } from "@/server/services/transactions";

type Context = { params: Promise<{ route: string[] }> };
const responseSchema = z.object({ user: z.object({ id: accountIdSchema, role: roleSchema, theme: themeSchema }) });
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, context: Context) {
  const path = (await context.params).route.join("/");
  if (path !== "sign-in/email" && path !== "sign-out") {
    return NextResponse.json({ message: "Tindakan tidak tersedia." }, { status: 404, headers: noStore });
  }

  const login = path === "sign-in/email";
  const forwardedHeaders = new Headers(request.headers);
  if (process.env.VERCEL !== "1") forwardedHeaders.delete(authIpHeader);
  let body: string | undefined;
  if (login) {
    const values = loginSchema.safeParse(await request.json().catch(() => null));
    if (!values.success) {
      return NextResponse.json({ message: "Periksa email dan kata sandi Anda." }, { status: 400, headers: noStore });
    }
    forwardedHeaders.set("content-type", "application/json");
    body = JSON.stringify(values.data);
  }

  forwardedHeaders.delete("content-length");
  const forwarded = new Request(request.url, { method: "POST", headers: forwardedHeaders, body });

  try {
    return await database().transaction(async (tx) => {
      await lockScope(tx, "accounts");
      const before = login ? null : await getActor(forwardedHeaders, tx);
      const response = await createAuth(tx).handler(forwarded);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.set("Cache-Control", "no-store");
      if (!response.ok) {
        const message = response.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar." : "Permintaan akun tidak berhasil.";
        return NextResponse.json({ message }, { status: response.status, headers });
      }
      if (login) {
        const { user } = responseSchema.parse(await response.json());
        await writeAudit(tx, { actorId: user.id, actorRole: user.role, entity: "account", entityId: user.id, action: "signin" });
        return NextResponse.json({ user: { role: user.role, theme: user.theme } }, { headers });
      }
      if (before) await writeAudit(tx, { actorId: before.id, actorRole: before.role, entity: "account", entityId: before.id, action: "signout" });
      return NextResponse.json({ success: true }, { headers });
    });
  } catch {
    return NextResponse.json({ message: "Layanan akun sementara tidak tersedia." }, { status: 503, headers: noStore });
  }
}

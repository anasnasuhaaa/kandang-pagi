import { NextResponse } from "next/server";
import { receiptFileError, receiptLimit } from "@/lib/receipts";
import { authConfig } from "@/server/auth/config";
import { requireRole } from "@/server/auth/permissions";
import { ServiceError, safeError } from "@/server/services/errors";
import { receiptDelivery, receiptHistory, uploadReceipt } from "@/server/services/receipts";

type Context = { params: Promise<{ cashId: string }> };
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

function failure(error: unknown) {
  const code = error instanceof ServiceError ? error.code : undefined;
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 :
    code === "not-found" ? 404 : code === "conflict" ? 409 : code === "invalid" ? 400 : 500;
  return NextResponse.json({ message: safeError(error) }, { status, headers });
}

async function readBody(request: Request) {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) return Buffer.concat(chunks, length);
    length += result.value.byteLength;
    if (length > receiptLimit) {
      await reader.cancel().catch(() => undefined);
      throw new ServiceError("invalid", "Ukuran gambar maksimal 2 MiB.");
    }
    chunks.push(result.value);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await requireRole(request.headers, ["administrator"]);
    if (request.headers.get("origin") !== authConfig().baseURL) throw new ServiceError("forbidden", "Asal permintaan tidak valid.");
    const mime = request.headers.get("content-type") ?? "";
    const precheck = receiptFileError(mime, Number(request.headers.get("content-length") ?? 1));
    if (precheck) throw new ServiceError("invalid", precheck);
    const { cashId } = await context.params;
    const requestId = request.headers.get("x-request-id") ?? "";
    const result = await uploadReceipt(request.headers, { cashId, requestId, bytes: await readBody(request), mime });
    return NextResponse.json({ id: result.id }, { status: result.replay ? 200 : 201, headers });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const { cashId } = await context.params;
    const query = new URL(request.url).searchParams;
    if (query.get("riwayat") === "1") {
      return NextResponse.json(await receiptHistory(request.headers, cashId), { headers });
    }
    const url = await receiptDelivery(request.headers, { cashId, receiptId: query.get("versi") ?? undefined });
    return new Response(null, { status: 302, headers: { ...headers, Location: url } });
  } catch (error) {
    return failure(error);
  }
}
